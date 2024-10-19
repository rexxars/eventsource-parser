# How to migrate from v2 to v3

## If importing from `eventsource-parser`

The parser now takes an object of callbacks instead of only an `onParse` callback. This means you do not have to check the type of the event in the `onEvent` callback, but instead provide separate callbacks for each event type:

```diff
-import {createParser, type ParsedEvent, type ReconnectInterval} from 'eventsource-parser'
+import {createParser, type EventSourceMessage} from 'eventsource-parser'

-const parser = createParser((event: ParsedEvent | ReconnectInterval) => {
-  if (event.type === 'event') {
-    // …handle event…
-  } else if (event.type === 'reconnect-interval') {
-    // …handle retry interval change…
-  }
-})
+const parser = createParser({
+  onEvent: (event: EventSourceMessage) => {
+    // …handle event…
+  },
+  onRetry: (interval: number) => {
+    // …handle retry interval change…
+  }
+})
```

The parser also now has a `onError` callback that you can use to handle parse errors, as well as an `onComment` callback that you can use to handle comments:

```ts
const parser = createParser({
  onEvent: (event: EventSourceMessage) => {
    // …handle event…
  },
  onRetry: (interval: number) => {
    // …handle retry interval change…
  },
  onError: (error: Error) => {
    // …handle parse error…
  },
  onComment: (comment: string) => {
    // …handle comment…
  },
})
```

Renamed types:

- `ParsedEvent` => `EventSourceMessage` (and `type` property is removed)

Removed types:

- `EventSourceParseCallback` - replaced with `ParserCallbacks` interface (`onEvent` property)
- `ReconnectInterval` - no longer needed, as the `onRetry` callback now provides the interval directly
- `ParseEvent` - no longer needed - the different event types are now handled by separate callbacks

## If using the `TransformStream` variant

No change is neccessary, but you can now subscribe to changes in the retry interval by providing a callback to the `onRetry` option when creating the stream:

```ts
const stream = new EventSourceParserStream({
  onRetry: (interval: number) => {
    // …handle retry interval change…
  },
})
```

There is also a new option to specify how parse should be handled - by default it will ignore them, but you can choose to terminate the stream or handle it manually:

```ts
const stream = new EventSourceParserStream({
  onError: (error: Error) => {
    // …handle parse error…
  },
})

// …or…
const stream = new EventSourceParserStream({
  onError: 'terminate',
})
```

Lastly, if you're interested in any comments that are encountered during parsing, you can provide a callback to the `onComment` option:

```ts
const stream = new EventSourceParserStream({
  onComment: (comment: string) => {
    // …handle comment…
  },
})
```
