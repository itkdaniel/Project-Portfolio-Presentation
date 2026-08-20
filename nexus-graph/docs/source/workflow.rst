Graph workflow and publishing
=============================

User workflow
-------------

#. Search and optionally filter entities on the main platform ``/graph`` page.
#. Select an entity to load a depth-one focused graph.
#. Inspect any graph node for metadata, source information, and related
   entities.
#. Choose a related entity to replace the focus safely, or request the next
   advertised depth.
#. Read any summarized-view notice before interpreting the visible graph as a
   complete relationship set.

Documentation publication
-------------------------

The ``Graph documentation`` GitHub Actions workflow builds HTML and checks
links for changes under ``nexus-graph/docs``. On a push to the protected main
branch, it uploads the verified HTML artifact to the repository's GitHub Pages
deployment workflow.

The public Pages URL is deliberately recorded in the README and product docs
only after the deployment has completed and exposed its verified URL. This
avoids presenting an unverified or stale documentation address.