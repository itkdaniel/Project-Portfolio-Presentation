"""
/documents router — upload, status, download, list, delete.
"""

import uuid
from typing import Optional

from fastapi import APIRouter, File, Form, HTTPException, Query, UploadFile
from fastapi.responses import FileResponse

from docuflow.core.config import settings
from docuflow.core.database import get_db
from docuflow.models.document import Document, DocumentStatus
from docuflow.services.storage import StorageService
from docuflow.worker import process_document

router = APIRouter()
storage = StorageService()


@router.post("/", status_code=201, summary="Upload document for processing")
async def upload_document(
    file: UploadFile = File(...),
    schema: str = Form("auto", description="Extraction schema: invoice|receipt|form|table|contract|auto"),
    webhook_url: Optional[str] = Form(None, description="Callback URL on completion"),
    priority: int = Form(5, ge=1, le=10, description="Processing priority (1=low, 10=high)"),
):
    # Validate file size
    content = await file.read()
    size_mb = len(content) / 1_048_576
    if size_mb > settings.max_file_size_mb:
        raise HTTPException(
            status_code=413,
            detail=f"File too large ({size_mb:.1f}MB). Max: {settings.max_file_size_mb}MB",
        )

    # Validate content type
    allowed_types = {
        "application/pdf", "application/msword",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "text/html", "image/png", "image/jpeg", "image/tiff",
    }
    if file.content_type not in allowed_types:
        raise HTTPException(
            status_code=415,
            detail=f"Unsupported file type: {file.content_type}",
        )

    # Generate ID and store file
    doc_id = f"doc_{uuid.uuid4().hex[:20]}"
    storage_key = await storage.put(doc_id, file.filename or "upload", content)

    # Create DB record
    async with get_db() as db:
        doc = await Document.create(db, {
            "id":          doc_id,
            "filename":    file.filename,
            "content_type": file.content_type,
            "size_bytes":  len(content),
            "storage_key": storage_key,
            "schema":      schema,
            "webhook_url": webhook_url,
            "status":      DocumentStatus.QUEUED,
            "priority":    priority,
        })

    # Enqueue Celery task
    process_document.apply_async(
        args=[doc_id],
        priority=priority,
        queue="documents",
    )

    return {
        "id":         doc.id,
        "status":     doc.status,
        "filename":   doc.filename,
        "size_bytes": doc.size_bytes,
        "schema":     doc.schema,
        "created_at": doc.created_at.isoformat(),
    }


@router.get("/{doc_id}", summary="Get document processing status and result")
async def get_document(doc_id: str):
    async with get_db() as db:
        doc = await Document.get(db, doc_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    return doc.to_dict()


@router.get("/{doc_id}/download", summary="Download extracted data as JSON")
async def download_result(doc_id: str):
    async with get_db() as db:
        doc = await Document.get(db, doc_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    if doc.status != DocumentStatus.COMPLETED:
        raise HTTPException(status_code=409, detail=f"Document not ready. Status: {doc.status}")

    result_path = await storage.get_result_path(doc_id)
    return FileResponse(result_path, media_type="application/json", filename=f"{doc_id}-result.json")


@router.get("/", summary="List documents (paginated)")
async def list_documents(
    page:   int = Query(1, ge=1),
    limit:  int = Query(20, ge=1, le=100),
    status: Optional[str] = Query(None),
):
    offset = (page - 1) * limit
    async with get_db() as db:
        docs, total = await Document.list(db, offset=offset, limit=limit, status=status)
    return {
        "items":  [d.to_dict() for d in docs],
        "total":  total,
        "page":   page,
        "limit":  limit,
        "pages":  -(-total // limit),  # ceiling division
    }


@router.delete("/{doc_id}", status_code=204, summary="Delete document")
async def delete_document(doc_id: str):
    async with get_db() as db:
        doc = await Document.get(db, doc_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    await storage.delete(doc.storage_key)
    async with get_db() as db:
        await Document.delete(db, doc_id)
