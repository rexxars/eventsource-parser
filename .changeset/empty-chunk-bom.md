---
'eventsource-parser': patch
---

Preserve leading byte-order mark handling after empty input chunks so the first event is not dropped when decoding a split UTF-8 BOM.
