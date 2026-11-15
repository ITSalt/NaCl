# Board open and autosave contract

The editor may call `onChange` while a board is mounting or while Excalidraw
normalizes its initial scene. Opening or selecting a board without an analyst
edit must not send `PUT /api/v1/boards/:name`. The loaded scene is the save
baseline for that board and revision.

A content edit schedules the existing debounced save for the board that was
being edited. Switching boards before the debounce expires cancels that save.
If a save is already in flight when the analyst switches boards, its response
may update the saved board's list row, but must not replace the newly selected
board's in-memory scene.

This contract keeps ordinary editing and save behavior. It does not introduce
a global read-only mode or change the server's board write route. The observed
private-browser board open on 2026-11-14 attempted an automatic `PUT` without
an analyst edit; that request was blocked before send. This source correction
is qualified with offline controlled frontend and request tests. A later
separately selected browser run must prove the packaged behavior.
