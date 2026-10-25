---
'eventsource-parser': patch
---

Avoid quadratic scanning of chunks containing many CR-terminated lines or a distant CR after LF-terminated lines.
