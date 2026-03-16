# NexusConsult – Automation Consulting Platform

## Overview
A full-stack consulting portfolio and automation platform built with a microservice-inspired architecture. Features a CRUD API for managing interactive project containers, real-time pub-sub updates via WebSocket, and a client booking system.

## Architecture
- **Frontend**: React + Vite + Tailwind v4 + shadcn/ui components
- **Backend**: Express.js REST API
- **Database**: PostgreSQL with Drizzle ORM
- **Real-time**: WebSocket pub-sub system (`/ws`) for live project updates
- **Routing**: wouter (frontend), Express (backend API)

## Database Schema
- `users` – Authentication (id, username, password)
- `projects` – Portfolio items (name, description, type, tags[], run/test commands, usage instructions, download/sandbox URLs, status, published flag)
- `bookings` – Client scheduling (name, email, company, details, date, time, status)
- `inquiries` – Customer inquiries with automated response tracking

## API Endpoints
| Method | Route | Description |
|--------|-------|-------------|
| GET | `/api/projects` | List all projects |
| GET | `/api/projects/:id` | Get single project |
| POST | `/api/projects` | Create project (triggers pub-sub) |
| PATCH | `/api/projects/:id` | Update project (triggers pub-sub) |
| DELETE | `/api/projects/:id` | Delete project (triggers pub-sub) |
| GET | `/api/bookings` | List bookings |
| POST | `/api/bookings` | Create booking |
| GET | `/api/inquiries` | List inquiries |
| POST | `/api/inquiries` | Create inquiry |
| PATCH | `/api/inquiries/:id/resolve` | Resolve inquiry |

## WebSocket Pub-Sub
Connect to `/ws` for real-time events:
- `project:created` – New project added
- `project:updated` – Project modified
- `project:deleted` – Project removed
- `booking:created` – New booking
- `inquiry:created` – New inquiry

## Key Files
- `shared/schema.ts` – Drizzle schema + Zod validation
- `server/db.ts` – Database connection pool
- `server/storage.ts` – Storage interface (DatabaseStorage)
- `server/routes.ts` – Express API routes
- `server/pubsub.ts` – WebSocket pub-sub manager
- `client/src/lib/websocket.ts` – Frontend WebSocket hook
- `client/src/lib/api.ts` – Frontend API client

## Pages
- `/` – Home (Hero with load balancer sim, Services grid, Project showcase)
- `/book` – Client booking/scheduling with calendar

## Design System
- Dark-mode "Tech Professional" aesthetic
- Font: Inter (display + body)
- Primary: Blue (#3B82F6 range)
- Accent: Purple (#9333EA range)
- Glass panels with backdrop blur