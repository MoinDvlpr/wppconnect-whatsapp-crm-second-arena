# WPPConnect integration

Installed version: **@wppconnect-team/wppconnect 2.3.3** (puppeteer 24.x). Node ≥ 20 (22 used). Chromium required.

## Client creation
`wppconnect.create({ session: slug, folderNameToken: WPP_SESSIONS_PATH, headless: true, autoClose: 0, waitForLogin: true, catchQR, statusFind, onLoadingScreen, puppeteerOptions: { executablePath, args: ['--no-sandbox', …] } })`.

## Method policy
* Prefer current APIs: `listChats` (not `getAllChats`), `getMessages(chatId,{count,direction,id})` (not `getAllMessagesInChat`/`loadEarlierMessages`), `sendText(to, text, {quotedMsg, mentionedList})` (not `reply`/`sendMentioned`), `forwardMessagesV2`, `startTyping/stopTyping` (not `setChatState`), `checkNumberStatus` (not `getNumberProfile`).
* Deprecated methods remain in the registry flagged `DEPRECATED` with their replacement and are callable only from the explorer.
* Every call goes through `timed()` structured logging (method, sessionId, chatId, duration, error) – message content is not logged.

## Events wired (listener layer)
onAnyMessage, onAck, onStateChange, onStreamChange, onInterfaceChange, onMessageEdit, onRevokedMessage, onReactionMessage, onPresenceChanged, onParticipantsChanged, onAddedToGroup, onNewChat, onIncomingCall, onPollResponse, onUpdateLabel. Not wired: onLiveLocation, onOrderStatusUpdate, onStreamModeChanged, onStreamInfoChanged, onBackendEvent.

## Status mapping
`statusFind`: isLogged/inChat/chatsAvailable → CONNECTED; qrReadSuccess/waitChat/phoneNotConnected → AUTHENTICATING; notLogged/qrReadFail → QR; desconnectedMobile/serverClose/browserClose/autocloseCalled → DISCONNECTED (+reconnect for browser/server close). `onStateChange`: CONNECTED → READY; CONFLICT/UNPAIRED/TIMEOUT → DISCONNECTED.

See `capability-matrix.md` for the full method list.
