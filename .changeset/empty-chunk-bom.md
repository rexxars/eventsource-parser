---
'eventsource-parser': patch
---

Handle leading byte-order marks across empty input chunks and split raw UTF-8 BOM chunks so the first event is not dropped.
