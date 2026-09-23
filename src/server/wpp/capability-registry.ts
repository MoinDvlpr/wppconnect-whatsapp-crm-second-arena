/**
 * WPPConnect Capability Registry.
 * Curated metadata is derived from the INSTALLED @wppconnect-team/wppconnect type definitions (dist/api/layers/*.d.ts).
 * At runtime `discoverRuntimeMethods()` introspects the actual Whatsapp class prototype chain so the audit compares
 * real available public methods vs the mapped ones. Nothing is invented: unmapped runtime methods are reported as UNMAPPED.
 */
import { Whatsapp } from "@wppconnect-team/wppconnect";

export type CapabilityCategory = "Host" | "Chat" | "Message" | "Contact" | "Group" | "Community" | "Profile" | "Business" | "Catalog" | "Labels" | "Lists" | "Newsletter" | "Status" | "Controls" | "Listener" | "UI" | "Media";
export type SupportStatus = "SUPPORTED" | "DEPRECATED" | "UNSUPPORTED";
export interface CapabilityParam { name: string; type: string; required?: boolean; description?: string; }
export interface Capability {
  method: string; category: CapabilityCategory; layer: string; params: CapabilityParam[]; returns: string; sessionState: "READY" | "ANY";
  exposed: boolean; service: string; endpoint?: string; wsEvent?: string; uiFeature?: string; status: SupportStatus; deprecated?: boolean; replacement?: string;
  explorer: boolean; // callable from the Developer API explorer
  dangerous?: boolean; // requires ADMIN in explorer
}
const p = (name: string, type: string, required = true, description?: string): CapabilityParam => ({ name, type, required, description });
const cap = (c: Omit<Capability, "explorer" | "exposed"> & { explorer?: boolean; exposed?: boolean }): Capability => ({ explorer: true, exposed: true, ...c });

export const CAPABILITIES: Capability[] = [
  // ----- Host layer -----
  cap({ method: "getHostDevice", category: "Host", layer: "host", params: [], returns: "HostDevice", sessionState: "READY", service: "SessionService", endpoint: "GET /api/v1/sessions/:id", uiFeature: "Sessions card", status: "SUPPORTED" }),
  cap({ method: "getWid", category: "Host", layer: "host", params: [], returns: "string", sessionState: "READY", service: "SessionService", endpoint: "GET /api/v1/sessions/:id", status: "SUPPORTED" }),
  cap({ method: "getWAVersion", category: "Host", layer: "host", params: [], returns: "string", sessionState: "READY", service: "SessionService", endpoint: "GET /api/v1/sessions/:id/diagnostics", uiFeature: "Health", status: "SUPPORTED" }),
  cap({ method: "getWAJSVersion", category: "Host", layer: "host", params: [], returns: "string", sessionState: "READY", service: "SessionService", endpoint: "GET /api/v1/sessions/:id/diagnostics", status: "SUPPORTED" }),
  cap({ method: "getConnectionState", category: "Host", layer: "host", params: [], returns: "SocketState", sessionState: "ANY", service: "SessionService", endpoint: "GET /api/v1/sessions/:id/status", uiFeature: "Sessions", status: "SUPPORTED" }),
  cap({ method: "isConnected", category: "Host", layer: "host", params: [], returns: "boolean", sessionState: "ANY", service: "SessionService", endpoint: "GET /api/v1/sessions/:id/diagnostics", status: "SUPPORTED" }),
  cap({ method: "isOnline", category: "Host", layer: "host", params: [], returns: "boolean", sessionState: "ANY", service: "SessionService", endpoint: "GET /api/v1/sessions/:id/diagnostics", status: "SUPPORTED" }),
  cap({ method: "isLoggedIn", category: "Host", layer: "host", params: [], returns: "boolean", sessionState: "ANY", service: "SessionService", endpoint: "GET /api/v1/sessions/:id/diagnostics", status: "SUPPORTED" }),
  cap({ method: "isAuthenticated", category: "Host", layer: "host", params: [], returns: "boolean", sessionState: "ANY", service: "SessionService", endpoint: "GET /api/v1/sessions/:id/diagnostics", status: "SUPPORTED" }),
  cap({ method: "isMainReady", category: "Host", layer: "host", params: [], returns: "boolean", sessionState: "ANY", service: "SessionService", status: "SUPPORTED" }),
  cap({ method: "isMainLoaded", category: "Host", layer: "host", params: [], returns: "boolean", sessionState: "ANY", service: "SessionService", status: "SUPPORTED" }),
  cap({ method: "isMainInit", category: "Host", layer: "host", params: [], returns: "boolean", sessionState: "ANY", service: "SessionService", status: "SUPPORTED" }),
  cap({ method: "isMultiDevice", category: "Host", layer: "host", params: [], returns: "boolean", sessionState: "READY", service: "SessionService", status: "SUPPORTED" }),
  cap({ method: "isLidMigrated", category: "Host", layer: "host", params: [], returns: "boolean", sessionState: "READY", service: "SessionService", status: "SUPPORTED" }),
  cap({ method: "getBatteryLevel", category: "Host", layer: "host", params: [], returns: "number", sessionState: "READY", service: "SessionService", endpoint: "GET /api/v1/sessions/:id/diagnostics", uiFeature: "Sessions card", status: "SUPPORTED" }),
  cap({ method: "getBuildConstants", category: "Host", layer: "host", params: [], returns: "BuildConstants", sessionState: "READY", service: "SessionService", status: "SUPPORTED" }),
  cap({ method: "getQrCode", category: "Host", layer: "host", params: [], returns: "ScrapQrcode", sessionState: "ANY", service: "SessionService", endpoint: "GET /api/v1/sessions/:id/qr", uiFeature: "QR dialog", status: "SUPPORTED", explorer: false }),
  cap({ method: "refreshLinkCode", category: "Host", layer: "host", params: [], returns: "string", sessionState: "ANY", service: "SessionService", status: "SUPPORTED", explorer: false }),
  cap({ method: "waitForQrCodeScan", category: "Host", layer: "host", params: [], returns: "void", sessionState: "ANY", service: "SessionManager", status: "SUPPORTED", explorer: false }),
  cap({ method: "waitForInChat", category: "Host", layer: "host", params: [], returns: "boolean", sessionState: "ANY", service: "SessionManager", status: "SUPPORTED", explorer: false }),
  cap({ method: "waitForPageLoad", category: "Host", layer: "host", params: [], returns: "void", sessionState: "ANY", service: "SessionManager", status: "SUPPORTED", explorer: false }),
  cap({ method: "waitForLogin", category: "Host", layer: "host", params: [], returns: "boolean", sessionState: "ANY", service: "SessionManager", status: "SUPPORTED", explorer: false }),
  cap({ method: "start", category: "Host", layer: "host", params: [], returns: "void", sessionState: "ANY", service: "SessionManager", status: "SUPPORTED", explorer: false }),
  cap({ method: "startPhoneWatchdog", category: "Host", layer: "host", params: [p("interval", "number", false)], returns: "void", sessionState: "READY", service: "SessionManager", status: "SUPPORTED" }),
  cap({ method: "stopPhoneWatchdog", category: "Host", layer: "host", params: [p("interval", "number")], returns: "void", sessionState: "READY", service: "SessionManager", status: "SUPPORTED" }),
  cap({ method: "joinWebBeta", category: "Host", layer: "host", params: [p("value", "boolean")], returns: "boolean", sessionState: "READY", service: "SessionService", status: "SUPPORTED", dangerous: true }),
  cap({ method: "logout", category: "Host", layer: "whatsapp", params: [], returns: "boolean", sessionState: "ANY", service: "SessionManager", endpoint: "POST /api/v1/sessions/:id/logout", uiFeature: "Sessions", status: "SUPPORTED", explorer: false }),
  cap({ method: "close", category: "Host", layer: "whatsapp", params: [], returns: "boolean", sessionState: "ANY", service: "SessionManager", endpoint: "POST /api/v1/sessions/:id/stop", status: "SUPPORTED", explorer: false }),
  cap({ method: "takeScreenshot", category: "Host", layer: "whatsapp", params: [], returns: "string(base64)", sessionState: "ANY", service: "SessionService", endpoint: "GET /api/v1/sessions/:id/screenshot", uiFeature: "Session diagnostics", status: "SUPPORTED" }),
  cap({ method: "useHere", category: "Host", layer: "whatsapp", params: [], returns: "boolean", sessionState: "ANY", service: "SessionService", endpoint: "POST /api/v1/sessions/:id/use-here", uiFeature: "Sessions (conflict)", status: "SUPPORTED" }),
  cap({ method: "rejectCall", category: "Host", layer: "whatsapp", params: [p("callId", "string", false)], returns: "boolean", sessionState: "READY", service: "SessionService", status: "SUPPORTED" }),
  cap({ method: "getSessionTokenBrowser", category: "Host", layer: "retriever", params: [p("removePath", "boolean", false)], returns: "SessionToken", sessionState: "READY", service: "SessionService", status: "SUPPORTED", explorer: false, exposed: false }),
  // ----- Chat / retriever -----
  cap({ method: "listChats", category: "Chat", layer: "retriever", params: [p("options", "ChatListOptions {onlyGroups?,onlyUsers?,onlyWithUnreadMessage?,withLabels?,count?,direction?,id?}", false)], returns: "Chat[]", sessionState: "READY", service: "ChatService", endpoint: "GET /api/v1/chats", uiFeature: "Inbox", status: "SUPPORTED" }),
  cap({ method: "getAllChats", category: "Chat", layer: "retriever", params: [p("withNewMessageOnly", "boolean", false)], returns: "Chat[]", sessionState: "READY", service: "ChatService", status: "DEPRECATED", deprecated: true, replacement: "listChats" }),
  cap({ method: "getAllChatsWithMessages", category: "Chat", layer: "retriever", params: [p("withNewMessageOnly", "boolean", false)], returns: "Chat[]", sessionState: "READY", service: "ChatService", status: "DEPRECATED", deprecated: true, replacement: "listChats" }),
  cap({ method: "getAllGroups", category: "Group", layer: "retriever", params: [p("withNewMessagesOnly", "boolean", false)], returns: "Chat[]", sessionState: "READY", service: "GroupService", status: "DEPRECATED", deprecated: true, replacement: "listChats({onlyGroups:true})" }),
  cap({ method: "getAllBroadcastList", category: "Chat", layer: "retriever", params: [], returns: "Chat[]", sessionState: "READY", service: "ChatService", status: "SUPPORTED" }),
  cap({ method: "getChatById", category: "Chat", layer: "retriever", params: [p("contactId", "string")], returns: "Chat", sessionState: "READY", service: "ChatService", endpoint: "GET /api/v1/chats/:id", uiFeature: "Inbox", status: "SUPPORTED" }),
  cap({ method: "getChat", category: "Chat", layer: "retriever", params: [p("contactId", "string")], returns: "Chat", sessionState: "READY", service: "ChatService", status: "DEPRECATED", deprecated: true, replacement: "getChatById" }),
  cap({ method: "getMessages", category: "Message", layer: "whatsapp", params: [p("chatId", "string"), p("params", "{count?:number,direction?:'before'|'after',id?:string,fromMe?:boolean,media?:string}", false)], returns: "Message[]", sessionState: "READY", service: "MessageService", endpoint: "GET /api/v1/chats/:id/messages", uiFeature: "Inbox pagination", status: "SUPPORTED" }),
  cap({ method: "getMessageById", category: "Message", layer: "whatsapp", params: [p("messageId", "string")], returns: "Message", sessionState: "READY", service: "MessageService", endpoint: "GET /api/v1/messages/:id", status: "SUPPORTED" }),
  cap({ method: "getMessagesFromRowId", category: "Message", layer: "retriever", params: [p("input", "{chatId,rowId,limit?,direction?}")], returns: "any[]", sessionState: "READY", service: "MessageService", status: "SUPPORTED" }),
  cap({ method: "getAllMessagesInChat", category: "Message", layer: "retriever", params: [p("chatId", "string"), p("includeMe", "boolean"), p("includeNotifications", "boolean")], returns: "Message[]", sessionState: "READY", service: "MessageService", status: "DEPRECATED", deprecated: true, replacement: "getMessages" }),
  cap({ method: "loadAndGetAllMessagesInChat", category: "Message", layer: "retriever", params: [p("chatId", "string")], returns: "Message[]", sessionState: "READY", service: "MessageService", status: "DEPRECATED", deprecated: true, replacement: "getMessages" }),
  cap({ method: "loadEarlierMessages", category: "Message", layer: "retriever", params: [p("contactId", "string")], returns: "Message[]", sessionState: "READY", service: "MessageService", status: "DEPRECATED", deprecated: true, replacement: "getMessages({direction:'before'})" }),
  cap({ method: "getAllUnreadMessages", category: "Message", layer: "retriever", params: [], returns: "PartialMessage[]", sessionState: "READY", service: "MessageService", status: "SUPPORTED" }),
  cap({ method: "getAllNewMessages", category: "Message", layer: "retriever", params: [], returns: "Message[]", sessionState: "READY", service: "MessageService", status: "DEPRECATED", deprecated: true, replacement: "getAllUnreadMessages" }),
  cap({ method: "getUnreadMessages", category: "Message", layer: "retriever", params: [p("includeMe", "boolean"), p("includeNotifications", "boolean"), p("useUnreadCount", "boolean")], returns: "any", sessionState: "READY", service: "MessageService", status: "DEPRECATED", deprecated: true, replacement: "getAllUnreadMessages" }),
  cap({ method: "getChatIsOnline", category: "Chat", layer: "retriever", params: [p("chatId", "string")], returns: "boolean", sessionState: "READY", service: "PresenceService", endpoint: "GET /api/v1/chats/:id/presence", uiFeature: "Inbox header", status: "SUPPORTED" }),
  cap({ method: "getLastSeen", category: "Chat", layer: "retriever", params: [p("chatId", "string")], returns: "number|boolean", sessionState: "READY", service: "PresenceService", endpoint: "GET /api/v1/chats/:id/presence", uiFeature: "Contact panel", status: "SUPPORTED" }),
  cap({ method: "getReactions", category: "Message", layer: "retriever", params: [p("msgId", "string")], returns: "{reactionByMe,reactions}", sessionState: "READY", service: "MessageService", endpoint: "GET /api/v1/messages/:id/reactions", status: "SUPPORTED" }),
  cap({ method: "getVotes", category: "Message", layer: "retriever", params: [p("msgId", "string")], returns: "{msgId,votes}", sessionState: "READY", service: "MessageService", endpoint: "GET /api/v1/messages/:id/votes", uiFeature: "Poll message", status: "SUPPORTED" }),
  cap({ method: "getPlatformFromMessage", category: "Message", layer: "retriever", params: [p("msgId", "string")], returns: "string", sessionState: "READY", service: "MessageService", status: "SUPPORTED" }),
  cap({ method: "getOrder", category: "Business", layer: "retriever", params: [p("msgId", "string")], returns: "OrderModel", sessionState: "READY", service: "CatalogService", status: "SUPPORTED" }),
  cap({ method: "getCommonGroups", category: "Contact", layer: "retriever", params: [p("wid", "string")], returns: "Wid[]", sessionState: "READY", service: "ContactService", endpoint: "GET /api/v1/contacts/:id/common-groups", uiFeature: "Contact panel", status: "SUPPORTED" }),
  cap({ method: "getPnLidEntry", category: "Contact", layer: "retriever", params: [p("phoneOrLid", "string")], returns: "PnLidEntryResult", sessionState: "READY", service: "ContactService", status: "SUPPORTED" }),
  cap({ method: "getListMutes", category: "Chat", layer: "retriever", params: [p("type", "string", false)], returns: "object", sessionState: "READY", service: "ChatService", status: "SUPPORTED" }),
  cap({ method: "getBlockList", category: "Contact", layer: "retriever", params: [], returns: "string[]", sessionState: "READY", service: "ContactService", endpoint: "GET /api/v1/contacts/blocklist", status: "SUPPORTED" }),
  cap({ method: "checkNumberStatus", category: "Contact", layer: "retriever", params: [p("contactId", "string")], returns: "WhatsappProfile", sessionState: "READY", service: "ContactService", endpoint: "POST /api/v1/contacts/check", uiFeature: "Contacts validity check", status: "SUPPORTED" }),
  cap({ method: "getNumberProfile", category: "Contact", layer: "retriever", params: [p("contactId", "string")], returns: "WhatsappProfile", sessionState: "READY", service: "ContactService", status: "DEPRECATED", deprecated: true, replacement: "checkNumberStatus" }),
  cap({ method: "getContact", category: "Contact", layer: "retriever", params: [p("contactId", "string")], returns: "Contact", sessionState: "READY", service: "ContactService", endpoint: "GET /api/v1/contacts/:id", status: "SUPPORTED" }),
  cap({ method: "getAllContacts", category: "Contact", layer: "retriever", params: [], returns: "Contact[]", sessionState: "READY", service: "ContactService", endpoint: "POST /api/v1/sessions/:id/sync", uiFeature: "Contacts sync", status: "SUPPORTED" }),
  cap({ method: "getProfilePicFromServer", category: "Contact", layer: "retriever", params: [p("chatId", "string")], returns: "ProfilePicThumbObj", sessionState: "READY", service: "ContactService", endpoint: "GET /api/v1/contacts/:id/picture", uiFeature: "Avatars", status: "SUPPORTED" }),
  cap({ method: "getStatus", category: "Contact", layer: "retriever", params: [p("contactId", "string")], returns: "ContactStatus", sessionState: "READY", service: "ContactService", endpoint: "GET /api/v1/contacts/:id/about", uiFeature: "Contact panel (About)", status: "SUPPORTED" }),
  cap({ method: "getTheme", category: "UI", layer: "ui", params: [], returns: "Theme", sessionState: "READY", service: "SessionService", status: "SUPPORTED" }),
  cap({ method: "setTheme", category: "UI", layer: "ui", params: [p("theme", "'light'|'dark'")], returns: "void", sessionState: "READY", service: "SessionService", status: "SUPPORTED" }),
  cap({ method: "openChat", category: "UI", layer: "ui", params: [p("chatId", "string")], returns: "boolean", sessionState: "READY", service: "ChatService", status: "SUPPORTED" }),
  cap({ method: "openChatAt", category: "UI", layer: "ui", params: [p("chatId", "string"), p("messageId", "string")], returns: "boolean", sessionState: "READY", service: "ChatService", status: "SUPPORTED" }),
  cap({ method: "closeChat", category: "UI", layer: "ui", params: [], returns: "boolean", sessionState: "READY", service: "ChatService", status: "SUPPORTED" }),
  cap({ method: "getActiveChat", category: "UI", layer: "ui", params: [], returns: "ChatModel", sessionState: "READY", service: "ChatService", status: "SUPPORTED" }),
  cap({ method: "getAutoDownloadSettings", category: "UI", layer: "ui", params: [], returns: "AutoDownloadSettings", sessionState: "READY", service: "SessionService", status: "SUPPORTED" }),
  cap({ method: "setAutoDownloadSettings", category: "UI", layer: "ui", params: [p("settings", "{image?,audio?,video?,document?}")], returns: "void", sessionState: "READY", service: "SessionService", status: "SUPPORTED" }),
  // ----- Sender -----
  cap({ method: "sendText", category: "Message", layer: "sender", params: [p("to", "string"), p("content", "string"), p("options", "{quotedMsg?,mentionedList?,linkPreview?,delay?}", false)], returns: "Message", sessionState: "READY", service: "MessageService", endpoint: "POST /api/v1/messages", uiFeature: "Composer", status: "SUPPORTED" }),
  cap({ method: "sendFile", category: "Media", layer: "sender", params: [p("to", "string"), p("pathOrBase64", "string"), p("options", "{type?,filename?,caption?,quotedMsg?,mimetype?}", false)], returns: "SendMessageReturn", sessionState: "READY", service: "MediaService", endpoint: "POST /api/v1/messages (media)", uiFeature: "Composer attachments", status: "SUPPORTED" }),
  cap({ method: "sendImage", category: "Media", layer: "sender", params: [p("to", "string"), p("filePath", "string"), p("filename", "string", false), p("caption", "string", false)], returns: "SendMessageReturn", sessionState: "READY", service: "MediaService", status: "SUPPORTED" }),
  cap({ method: "sendImageFromBase64", category: "Media", layer: "sender", params: [p("to", "string"), p("base64", "string"), p("filename", "string"), p("caption", "string", false)], returns: "SendMessageReturn", sessionState: "READY", service: "MediaService", status: "SUPPORTED" }),
  cap({ method: "getPID", category: "Host", layer: "whatsapp", params: [], returns: "number (browser process id)", sessionState: "ANY", service: "SessionService", endpoint: "GET /api/v1/sessions/:id/diagnostics", uiFeature: "Session diagnostics", status: "SUPPORTED" }),
  cap({ method: "sendFileFromBase64", category: "Media", layer: "sender", params: [p("chatId", "string"), p("base64", "string"), p("filename", "string"), p("caption", "string", false)], returns: "any", sessionState: "READY", service: "MediaService", status: "SUPPORTED" }),
  cap({ method: "sendPtt", category: "Media", layer: "sender", params: [p("to", "string"), p("filePath", "string"), p("filename", "string", false)], returns: "unknown", sessionState: "READY", service: "MediaService", uiFeature: "Voice note", status: "SUPPORTED" }),
  cap({ method: "sendPttFromBase64", category: "Media", layer: "sender", params: [p("to", "string"), p("base64", "string"), p("filename", "string")], returns: "unknown", sessionState: "READY", service: "MediaService", status: "SUPPORTED" }),
  cap({ method: "sendVideoAsGif", category: "Media", layer: "sender", params: [p("to", "string"), p("filePath", "string")], returns: "any", sessionState: "READY", service: "MediaService", status: "SUPPORTED" }),
  cap({ method: "sendVideoAsGifFromBase64", category: "Media", layer: "sender", params: [p("to", "string"), p("base64", "string"), p("filename", "string")], returns: "any", sessionState: "READY", service: "MediaService", status: "SUPPORTED" }),
  cap({ method: "sendGif", category: "Media", layer: "sender", params: [p("to", "string"), p("filePath", "string")], returns: "any", sessionState: "READY", service: "MediaService", status: "SUPPORTED" }),
  cap({ method: "sendGifFromBase64", category: "Media", layer: "sender", params: [p("to", "string"), p("base64", "string"), p("filename", "string")], returns: "any", sessionState: "READY", service: "MediaService", status: "SUPPORTED" }),
  cap({ method: "sendImageAsSticker", category: "Media", layer: "sender", params: [p("to", "string"), p("pathOrBase64", "string")], returns: "SendMessageReturn", sessionState: "READY", service: "MediaService", endpoint: "POST /api/v1/messages (sticker)", uiFeature: "Composer sticker", status: "SUPPORTED" }),
  cap({ method: "sendImageAsStickerGif", category: "Media", layer: "sender", params: [p("to", "string"), p("pathOrBase64", "string")], returns: "SendMessageReturn", sessionState: "READY", service: "MediaService", status: "SUPPORTED" }),
  cap({ method: "sendLocation", category: "Message", layer: "sender", params: [p("to", "string"), p("options", "{lat,lng,title?,address?,name?}")], returns: "SendMessageReturn", sessionState: "READY", service: "MessageService", endpoint: "POST /api/v1/messages (location)", uiFeature: "Composer location", status: "SUPPORTED" }),
  cap({ method: "sendContactVcard", category: "Message", layer: "sender", params: [p("to", "string"), p("contactsId", "string"), p("name", "string", false)], returns: "SendMessageReturn", sessionState: "READY", service: "MessageService", endpoint: "POST /api/v1/messages (contact)", uiFeature: "Composer contact", status: "SUPPORTED" }),
  cap({ method: "sendContactVcardList", category: "Message", layer: "sender", params: [p("to", "string"), p("contacts", "string[]")], returns: "SendMessageReturn", sessionState: "READY", service: "MessageService", status: "SUPPORTED" }),
  cap({ method: "sendLinkPreview", category: "Message", layer: "sender", params: [p("chatId", "string"), p("url", "string"), p("text", "string", false)], returns: "SendMessageReturn", sessionState: "READY", service: "MessageService", status: "SUPPORTED" }),
  cap({ method: "sendMessageWithThumb", category: "Message", layer: "sender", params: [p("pathOrBase64", "string"), p("url", "string"), p("title", "string"), p("description", "string"), p("chatId", "string")], returns: "any", sessionState: "READY", service: "MessageService", status: "SUPPORTED" }),
  cap({ method: "sendMentioned", category: "Message", layer: "sender", params: [p("to", "string"), p("message", "string"), p("mentioned", "string[]")], returns: "SendMessageReturn", sessionState: "READY", service: "MessageService", status: "DEPRECATED", deprecated: true, replacement: "sendText with options.mentionedList" }),
  cap({ method: "reply", category: "Message", layer: "sender", params: [p("to", "string"), p("content", "string"), p("quotedMsg", "string")], returns: "Message", sessionState: "READY", service: "MessageService", status: "DEPRECATED", deprecated: true, replacement: "sendText with options.quotedMsg" }),
  cap({ method: "sendMessageOptions", category: "Message", layer: "sender", params: [p("chat", "string"), p("content", "any"), p("options", "any", false)], returns: "Message", sessionState: "READY", service: "MessageService", status: "DEPRECATED", deprecated: true, replacement: "sendText" }),
  cap({ method: "sendListMessage", category: "Message", layer: "sender", params: [p("to", "string"), p("options", "{buttonText,description,sections:[{title,rows:[{rowId,title,description?}]}]}")], returns: "Message", sessionState: "READY", service: "MessageService", endpoint: "POST /api/v1/messages (list)", status: "SUPPORTED" }),
  cap({ method: "sendPollMessage", category: "Message", layer: "sender", params: [p("chatId", "string"), p("name", "string"), p("choices", "string[]"), p("options", "{selectableCount?}", false)], returns: "Message", sessionState: "READY", service: "MessageService", endpoint: "POST /api/v1/messages (poll)", uiFeature: "Composer poll", status: "SUPPORTED" }),
  cap({ method: "sendOrderMessage", category: "Business", layer: "sender", params: [p("to", "string"), p("items", "OrderItems[]"), p("options", "OrderMessageOptions", false)], returns: "Message", sessionState: "READY", service: "CatalogService", status: "SUPPORTED" }),
  cap({ method: "sendPixKey", category: "Message", layer: "sender", params: [p("to", "string"), p("params", "PixParams")], returns: "Message", sessionState: "READY", service: "MessageService", status: "SUPPORTED" }),
  cap({ method: "forwardMessagesV2", category: "Message", layer: "sender", params: [p("toChatId", "string"), p("messages", "string|string[]"), p("options", "ForwardMessagesOptions", false)], returns: "any[]", sessionState: "READY", service: "MessageService", endpoint: "POST /api/v1/messages/:id/forward", uiFeature: "Forward", status: "SUPPORTED" }),
  cap({ method: "forwardMessage", category: "Message", layer: "sender", params: [p("toChatId", "string"), p("msgId", "string|string[]")], returns: "boolean", sessionState: "READY", service: "MessageService", status: "DEPRECATED", deprecated: true, replacement: "forwardMessagesV2" }),
  cap({ method: "sendReactionToMessage", category: "Message", layer: "sender", params: [p("msgId", "string"), p("reaction", "string|false")], returns: "{sendMsgResult}", sessionState: "READY", service: "MessageService", endpoint: "POST /api/v1/messages/:id/react", uiFeature: "Reactions", status: "SUPPORTED" }),
  cap({ method: "sendSeen", category: "Chat", layer: "sender", params: [p("chatId", "string")], returns: "{wid,unreadCount}", sessionState: "READY", service: "ChatService", endpoint: "POST /api/v1/chats/:id/seen", uiFeature: "Open chat", status: "SUPPORTED" }),
  cap({ method: "markPlayed", category: "Message", layer: "sender", params: [p("msgId", "string")], returns: "any", sessionState: "READY", service: "MessageService", status: "SUPPORTED" }),
  cap({ method: "startTyping", category: "Chat", layer: "sender", params: [p("to", "string"), p("duration", "number", false)], returns: "void", sessionState: "READY", service: "PresenceService", endpoint: "POST /api/v1/chats/:id/typing", uiFeature: "Composer typing", status: "SUPPORTED" }),
  cap({ method: "stopTyping", category: "Chat", layer: "sender", params: [p("to", "string")], returns: "void", sessionState: "READY", service: "PresenceService", endpoint: "POST /api/v1/chats/:id/typing", status: "SUPPORTED" }),
  cap({ method: "startRecording", category: "Chat", layer: "sender", params: [p("to", "string"), p("duration", "number", false)], returns: "void", sessionState: "READY", service: "PresenceService", endpoint: "POST /api/v1/chats/:id/typing", status: "SUPPORTED" }),
  cap({ method: "stopRecording", category: "Chat", layer: "sender", params: [p("to", "string")], returns: "void", sessionState: "READY", service: "PresenceService", status: "SUPPORTED" }),
  cap({ method: "stopRecoring", category: "Chat", layer: "sender", params: [p("to", "string")], returns: "void", sessionState: "READY", service: "PresenceService", status: "DEPRECATED", deprecated: true, replacement: "stopRecording" }),
  cap({ method: "setChatState", category: "Chat", layer: "sender", params: [p("chatId", "string"), p("chatState", "0|1|2")], returns: "void", sessionState: "READY", service: "PresenceService", status: "DEPRECATED", deprecated: true, replacement: "startTyping/startRecording" }),
  cap({ method: "setOnlinePresence", category: "Chat", layer: "sender", params: [p("online", "boolean", false)], returns: "boolean", sessionState: "READY", service: "PresenceService", endpoint: "POST /api/v1/sessions/:id/presence", uiFeature: "Session settings", status: "SUPPORTED" }),
  // ----- Controls -----
  cap({ method: "blockContact", category: "Contact", layer: "controls", params: [p("contactId", "string")], returns: "boolean", sessionState: "READY", service: "ContactService", endpoint: "POST /api/v1/contacts/:id/block", uiFeature: "Contact panel", status: "SUPPORTED" }),
  cap({ method: "unblockContact", category: "Contact", layer: "controls", params: [p("contactId", "string")], returns: "boolean", sessionState: "READY", service: "ContactService", endpoint: "POST /api/v1/contacts/:id/unblock", uiFeature: "Contact panel", status: "SUPPORTED" }),
  cap({ method: "markUnseenMessage", category: "Chat", layer: "controls", params: [p("contactId", "string")], returns: "boolean", sessionState: "READY", service: "ChatService", endpoint: "POST /api/v1/chats/:id/unseen", uiFeature: "Chat menu", status: "SUPPORTED" }),
  cap({ method: "deleteChat", category: "Chat", layer: "controls", params: [p("chatId", "string")], returns: "boolean", sessionState: "READY", service: "ChatService", endpoint: "DELETE /api/v1/chats/:id", uiFeature: "Chat menu", status: "SUPPORTED", dangerous: true }),
  cap({ method: "archiveChat", category: "Chat", layer: "controls", params: [p("chatId", "string"), p("option", "boolean", false)], returns: "object", sessionState: "READY", service: "ChatService", endpoint: "POST /api/v1/chats/:id/archive", uiFeature: "Chat menu", status: "SUPPORTED" }),
  cap({ method: "pinChat", category: "Chat", layer: "controls", params: [p("chatId", "string"), p("option", "boolean")], returns: "object", sessionState: "READY", service: "ChatService", endpoint: "POST /api/v1/chats/:id/pin", uiFeature: "Chat menu", status: "SUPPORTED" }),
  cap({ method: "clearChat", category: "Chat", layer: "controls", params: [p("chatId", "string"), p("keepStarred", "boolean", false)], returns: "boolean", sessionState: "READY", service: "ChatService", endpoint: "POST /api/v1/chats/:id/clear", status: "SUPPORTED", dangerous: true }),
  cap({ method: "deleteMessage", category: "Message", layer: "controls", params: [p("chatId", "string"), p("messageId", "string|string[]"), p("onlyLocal", "boolean", false)], returns: "boolean", sessionState: "READY", service: "MessageService", endpoint: "DELETE /api/v1/messages/:id", uiFeature: "Delete / Delete for me", status: "SUPPORTED" }),
  cap({ method: "editMessage", category: "Message", layer: "controls", params: [p("msgId", "string"), p("newText", "string")], returns: "Message", sessionState: "READY", service: "MessageService", endpoint: "PATCH /api/v1/messages/:id", uiFeature: "Edit message", status: "SUPPORTED" }),
  cap({ method: "starMessage", category: "Message", layer: "controls", params: [p("messagesId", "string|string[]"), p("star", "boolean", false)], returns: "number", sessionState: "READY", service: "MessageService", endpoint: "POST /api/v1/messages/:id/star", uiFeature: "Star", status: "SUPPORTED" }),
  cap({ method: "setMessagesAdminsOnly", category: "Group", layer: "controls", params: [p("chatId", "string"), p("option", "boolean")], returns: "boolean", sessionState: "READY", service: "GroupService", endpoint: "PATCH /api/v1/groups/:id/settings", uiFeature: "Group settings", status: "SUPPORTED" }),
  cap({ method: "setTemporaryMessages", category: "Chat", layer: "controls", params: [p("chatOrGroupId", "string"), p("value", "boolean")], returns: "boolean", sessionState: "READY", service: "ChatService", status: "SUPPORTED" }),
  cap({ method: "setLimit", category: "Controls", layer: "controls", params: [p("key", "'maxMediaSize'|'maxFileSize'|'maxShare'|'statusVideoMaxDuration'|'unlimitedPin'"), p("value", "boolean|number")], returns: "number", sessionState: "READY", service: "SessionService", status: "SUPPORTED", dangerous: true }),
  cap({ method: "sendMute", category: "Chat", layer: "profile", params: [p("id", "string"), p("time", "number"), p("type", "'hours'|'days'|'week'|'year'")], returns: "object", sessionState: "READY", service: "ChatService", endpoint: "POST /api/v1/chats/:id/mute", uiFeature: "Chat menu", status: "SUPPORTED" }),
  // ----- Group -----
  cap({ method: "createGroup", category: "Group", layer: "group", params: [p("groupName", "string"), p("contacts", "string|string[]")], returns: "{gid,participants}", sessionState: "READY", service: "GroupService", endpoint: "POST /api/v1/groups", uiFeature: "Groups", status: "SUPPORTED" }),
  cap({ method: "leaveGroup", category: "Group", layer: "group", params: [p("groupId", "string")], returns: "void", sessionState: "READY", service: "GroupService", endpoint: "POST /api/v1/groups/:id/leave", uiFeature: "Group details", status: "SUPPORTED", dangerous: true }),
  cap({ method: "getGroupMembersIds", category: "Group", layer: "group", params: [p("groupId", "string")], returns: "Id[]", sessionState: "READY", service: "GroupService", status: "SUPPORTED" }),
  cap({ method: "getGroupMembers", category: "Group", layer: "group", params: [p("groupId", "string")], returns: "Contact[]", sessionState: "READY", service: "GroupService", endpoint: "GET /api/v1/groups/:id", uiFeature: "Group members", status: "SUPPORTED" }),
  cap({ method: "getGroupAdmins", category: "Group", layer: "group", params: [p("chatId", "string")], returns: "Wid[]", sessionState: "READY", service: "GroupService", endpoint: "GET /api/v1/groups/:id", uiFeature: "Group admins", status: "SUPPORTED" }),
  cap({ method: "getGroupInviteLink", category: "Group", layer: "group", params: [p("chatId", "string")], returns: "string", sessionState: "READY", service: "GroupService", endpoint: "GET /api/v1/groups/:id/invite-link", uiFeature: "Invite link", status: "SUPPORTED" }),
  cap({ method: "revokeGroupInviteLink", category: "Group", layer: "group", params: [p("chatId", "string")], returns: "string", sessionState: "READY", service: "GroupService", endpoint: "POST /api/v1/groups/:id/invite-link/revoke", uiFeature: "Invite link", status: "SUPPORTED" }),
  cap({ method: "getGroupInfoFromInviteLink", category: "Group", layer: "group", params: [p("inviteCode", "string")], returns: "object", sessionState: "READY", service: "GroupService", status: "SUPPORTED" }),
  cap({ method: "joinGroup", category: "Group", layer: "group", params: [p("inviteCode", "string")], returns: "JoinGroupResult", sessionState: "READY", service: "GroupService", endpoint: "POST /api/v1/groups/join", status: "SUPPORTED" }),
  cap({ method: "addParticipant", category: "Group", layer: "group", params: [p("groupId", "string"), p("participantId", "string|string[]")], returns: "object", sessionState: "READY", service: "GroupService", endpoint: "POST /api/v1/groups/:id/participants", uiFeature: "Group members", status: "SUPPORTED" }),
  cap({ method: "removeParticipant", category: "Group", layer: "group", params: [p("groupId", "string"), p("participantId", "string|string[]")], returns: "void", sessionState: "READY", service: "GroupService", endpoint: "DELETE /api/v1/groups/:id/participants", uiFeature: "Group members", status: "SUPPORTED" }),
  cap({ method: "promoteParticipant", category: "Group", layer: "group", params: [p("groupId", "string"), p("participantId", "string|string[]")], returns: "void", sessionState: "READY", service: "GroupService", endpoint: "POST /api/v1/groups/:id/promote", uiFeature: "Group members", status: "SUPPORTED" }),
  cap({ method: "demoteParticipant", category: "Group", layer: "group", params: [p("groupId", "string"), p("participantId", "string|string[]")], returns: "void", sessionState: "READY", service: "GroupService", endpoint: "POST /api/v1/groups/:id/demote", uiFeature: "Group members", status: "SUPPORTED" }),
  cap({ method: "setGroupDescription", category: "Group", layer: "group", params: [p("groupId", "string"), p("description", "string")], returns: "boolean", sessionState: "READY", service: "GroupService", endpoint: "PATCH /api/v1/groups/:id", uiFeature: "Group settings", status: "SUPPORTED" }),
  cap({ method: "setGroupSubject", category: "Group", layer: "group", params: [p("groupId", "string"), p("title", "string")], returns: "boolean", sessionState: "READY", service: "GroupService", endpoint: "PATCH /api/v1/groups/:id", uiFeature: "Group settings", status: "SUPPORTED" }),
  cap({ method: "setGroupProperty", category: "Group", layer: "group", params: [p("groupId", "string"), p("property", "'announcement'|'restrict'|'ephemeral'"), p("value", "boolean")], returns: "boolean", sessionState: "READY", service: "GroupService", endpoint: "PATCH /api/v1/groups/:id/settings", uiFeature: "Group settings", status: "SUPPORTED" }),
  cap({ method: "setGroupIcon", category: "Group", layer: "group", params: [p("groupId", "string"), p("pathOrBase64", "string")], returns: "object", sessionState: "READY", service: "GroupService", endpoint: "POST /api/v1/groups/:id/icon", status: "SUPPORTED" }),
  cap({ method: "removeGroupIcon", category: "Group", layer: "group", params: [p("groupId", "string")], returns: "boolean", sessionState: "READY", service: "GroupService", status: "SUPPORTED" }),
  cap({ method: "getGroupSizeLimit", category: "Group", layer: "group", params: [], returns: "number", sessionState: "READY", service: "GroupService", status: "SUPPORTED" }),
  cap({ method: "getGroupMembershipRequests", category: "Group", layer: "group", params: [p("groupId", "string")], returns: "object[]", sessionState: "READY", service: "GroupService", endpoint: "GET /api/v1/groups/:id/requests", uiFeature: "Membership requests", status: "SUPPORTED" }),
  cap({ method: "approveGroupMembershipRequest", category: "Group", layer: "group", params: [p("groupId", "string"), p("membershipIds", "string|string[]")], returns: "object", sessionState: "READY", service: "GroupService", endpoint: "POST /api/v1/groups/:id/requests/approve", status: "SUPPORTED" }),
  cap({ method: "rejectGroupMembershipRequest", category: "Group", layer: "group", params: [p("groupId", "string"), p("membershipIds", "string|string[]")], returns: "object", sessionState: "READY", service: "GroupService", endpoint: "POST /api/v1/groups/:id/requests/reject", status: "SUPPORTED" }),
  // ----- Community -----
  cap({ method: "createCommunity", category: "Community", layer: "community", params: [p("name", "string"), p("description", "string"), p("groupIds", "string[]")], returns: "any", sessionState: "READY", service: "GroupService", status: "SUPPORTED" }),
  cap({ method: "deactivateCommunity", category: "Community", layer: "community", params: [p("communityId", "string")], returns: "any", sessionState: "READY", service: "GroupService", status: "SUPPORTED", dangerous: true }),
  cap({ method: "addSubgroupsCommunity", category: "Community", layer: "community", params: [p("communityId", "string"), p("groupsIds", "string[]")], returns: "any", sessionState: "READY", service: "GroupService", status: "SUPPORTED" }),
  cap({ method: "removeSubgroupsCommunity", category: "Community", layer: "community", params: [p("communityId", "string"), p("groupsIds", "string[]")], returns: "any", sessionState: "READY", service: "GroupService", status: "SUPPORTED" }),
  cap({ method: "promoteCommunityParticipant", category: "Community", layer: "community", params: [p("communityId", "string"), p("participantId", "string|string[]")], returns: "any", sessionState: "READY", service: "GroupService", status: "SUPPORTED" }),
  cap({ method: "demoteCommunityParticipant", category: "Community", layer: "community", params: [p("communityId", "string"), p("participantId", "string|string[]")], returns: "any", sessionState: "READY", service: "GroupService", status: "SUPPORTED" }),
  cap({ method: "getCommunityParticipants", category: "Community", layer: "community", params: [p("communityId", "string")], returns: "any", sessionState: "READY", service: "GroupService", status: "SUPPORTED" }),
  // ----- Profile -----
  cap({ method: "getProfileName", category: "Profile", layer: "profile", params: [], returns: "string", sessionState: "READY", service: "ProfileService", endpoint: "GET /api/v1/profile", uiFeature: "Business profile", status: "SUPPORTED" }),
  cap({ method: "setProfileName", category: "Profile", layer: "profile", params: [p("name", "string")], returns: "boolean", sessionState: "READY", service: "ProfileService", endpoint: "PATCH /api/v1/profile", uiFeature: "Business profile", status: "SUPPORTED" }),
  cap({ method: "getProfileStatus", category: "Profile", layer: "profile", params: [], returns: "string", sessionState: "READY", service: "ProfileService", endpoint: "GET /api/v1/profile", status: "SUPPORTED" }),
  cap({ method: "setProfileStatus", category: "Profile", layer: "profile", params: [p("status", "string")], returns: "void", sessionState: "READY", service: "ProfileService", endpoint: "PATCH /api/v1/profile", status: "SUPPORTED" }),
  cap({ method: "setProfilePic", category: "Profile", layer: "profile", params: [p("pathOrBase64", "string"), p("to", "string", false)], returns: "boolean", sessionState: "READY", service: "ProfileService", endpoint: "POST /api/v1/profile/picture", status: "SUPPORTED" }),
  cap({ method: "removeMyProfilePicture", category: "Profile", layer: "profile", params: [], returns: "boolean", sessionState: "READY", service: "ProfileService", endpoint: "DELETE /api/v1/profile/picture", status: "SUPPORTED" }),
  // ----- Business / catalog -----
  cap({ method: "getBusinessProfile", category: "Business", layer: "business", params: [p("id", "string")], returns: "any", sessionState: "READY", service: "ProfileService", endpoint: "GET /api/v1/profile/business", uiFeature: "Business profile", status: "SUPPORTED" }),
  cap({ method: "editBusinessProfile", category: "Business", layer: "business", params: [p("options", "{adress?,email?,categories?,website?,businessHours?}")], returns: "any", sessionState: "READY", service: "ProfileService", endpoint: "PATCH /api/v1/profile/business", status: "SUPPORTED" }),
  cap({ method: "getBusinessProfilesProducts", category: "Catalog", layer: "business", params: [p("id", "string")], returns: "any", sessionState: "READY", service: "CatalogService", endpoint: "GET /api/v1/catalog/:contactId", status: "SUPPORTED" }),
  cap({ method: "getOrderbyMsg", category: "Business", layer: "business", params: [p("messageId", "string")], returns: "any", sessionState: "READY", service: "CatalogService", status: "SUPPORTED" }),
  cap({ method: "sendImageWithProduct", category: "Catalog", layer: "business", params: [p("to", "string"), p("base64", "string"), p("caption", "string"), p("businessId", "string"), p("productId", "string")], returns: "void", sessionState: "READY", service: "CatalogService", endpoint: "POST /api/v1/catalog/send", uiFeature: "Catalog", status: "SUPPORTED" }),
  cap({ method: "getProducts", category: "Catalog", layer: "catalog", params: [p("id", "string"), p("qnt", "number")], returns: "Product[]", sessionState: "READY", service: "CatalogService", endpoint: "GET /api/v1/catalog", uiFeature: "Catalog", status: "SUPPORTED" }),
  cap({ method: "getProductById", category: "Catalog", layer: "catalog", params: [p("id", "string"), p("productId", "string")], returns: "Product", sessionState: "READY", service: "CatalogService", endpoint: "GET /api/v1/catalog/products/:id", status: "SUPPORTED" }),
  cap({ method: "createProduct", category: "Catalog", layer: "catalog", params: [p("name", "string"), p("image", "string(base64)"), p("description", "string"), p("price", "number"), p("isHidden", "boolean"), p("url", "string"), p("retailerId", "string"), p("currency", "string")], returns: "Product", sessionState: "READY", service: "CatalogService", endpoint: "POST /api/v1/catalog/products", uiFeature: "Catalog", status: "SUPPORTED" }),
  cap({ method: "editProduct", category: "Catalog", layer: "catalog", params: [p("productId", "string"), p("options", "{name?,description?,price?,isHidden?,url?,retailerId?}")], returns: "ProductModel", sessionState: "READY", service: "CatalogService", endpoint: "PATCH /api/v1/catalog/products/:id", status: "SUPPORTED" }),
  cap({ method: "delProducts", category: "Catalog", layer: "catalog", params: [p("productsId", "string[]")], returns: "any", sessionState: "READY", service: "CatalogService", endpoint: "DELETE /api/v1/catalog/products/:id", status: "SUPPORTED", dangerous: true }),
  cap({ method: "changeProductImage", category: "Catalog", layer: "catalog", params: [p("productId", "string"), p("image", "string(base64)")], returns: "any", sessionState: "READY", service: "CatalogService", status: "SUPPORTED" }),
  cap({ method: "addProductImage", category: "Catalog", layer: "catalog", params: [p("productId", "string"), p("image", "string(base64)")], returns: "any", sessionState: "READY", service: "CatalogService", status: "SUPPORTED" }),
  cap({ method: "removeProductImage", category: "Catalog", layer: "catalog", params: [p("productId", "string"), p("index", "string")], returns: "ProductModel", sessionState: "READY", service: "CatalogService", status: "SUPPORTED" }),
  cap({ method: "getCollections", category: "Catalog", layer: "catalog", params: [p("id", "string"), p("qnt", "string"), p("maxProducts", "string")], returns: "ProductCollModel[]", sessionState: "READY", service: "CatalogService", endpoint: "GET /api/v1/catalog/collections", status: "SUPPORTED" }),
  cap({ method: "createCollection", category: "Catalog", layer: "catalog", params: [p("collectionName", "string"), p("productsId", "string")], returns: "any", sessionState: "READY", service: "CatalogService", status: "SUPPORTED" }),
  cap({ method: "editCollection", category: "Catalog", layer: "catalog", params: [p("collectionId", "string"), p("options", "string")], returns: "any", sessionState: "READY", service: "CatalogService", status: "SUPPORTED" }),
  cap({ method: "deleteCollection", category: "Catalog", layer: "catalog", params: [p("collectionId", "string")], returns: "any", sessionState: "READY", service: "CatalogService", status: "SUPPORTED", dangerous: true }),
  cap({ method: "setProductVisibility", category: "Catalog", layer: "catalog", params: [p("productId", "string"), p("value", "boolean")], returns: "any", sessionState: "READY", service: "CatalogService", status: "SUPPORTED" }),
  cap({ method: "updateCartEnabled", category: "Catalog", layer: "catalog", params: [p("value", "boolean")], returns: "any", sessionState: "READY", service: "CatalogService", status: "SUPPORTED" }),
  // ----- Labels (native) -----
  cap({ method: "getAllLabels", category: "Labels", layer: "labels", params: [], returns: "Label[]", sessionState: "READY", service: "LabelService", endpoint: "GET /api/v1/labels/native", uiFeature: "Labels (native tab)", status: "SUPPORTED" }),
  cap({ method: "addNewLabel", category: "Labels", layer: "labels", params: [p("name", "string"), p("options", "{labelColor?}", false)], returns: "void", sessionState: "READY", service: "LabelService", endpoint: "POST /api/v1/labels/native", status: "SUPPORTED" }),
  cap({ method: "getLabelById", category: "Labels", layer: "labels", params: [p("id", "string")], returns: "Label", sessionState: "READY", service: "LabelService", status: "SUPPORTED" }),
  cap({ method: "deleteLabel", category: "Labels", layer: "labels", params: [p("id", "string|string[]")], returns: "void", sessionState: "READY", service: "LabelService", endpoint: "DELETE /api/v1/labels/native/:id", status: "SUPPORTED" }),
  cap({ method: "deleteAllLabels", category: "Labels", layer: "labels", params: [], returns: "void", sessionState: "READY", service: "LabelService", status: "SUPPORTED", dangerous: true }),
  cap({ method: "addOrRemoveLabels", category: "Labels", layer: "labels", params: [p("chatIds", "string|string[]"), p("options", "[{labelId,type:'add'|'remove'}]")], returns: "void", sessionState: "READY", service: "LabelService", endpoint: "POST /api/v1/labels/native/assign", status: "SUPPORTED" }),
  // ----- Lists -----
  cap({ method: "getAllLists", category: "Lists", layer: "lists", params: [], returns: "ListInfo[]", sessionState: "READY", service: "ChatService", status: "SUPPORTED" }),
  cap({ method: "createList", category: "Lists", layer: "lists", params: [p("name", "string"), p("chatIds", "string[]", false)], returns: "string", sessionState: "READY", service: "ChatService", status: "SUPPORTED" }),
  cap({ method: "addChatsToList", category: "Lists", layer: "lists", params: [p("listId", "string"), p("chatIds", "string[]")], returns: "void", sessionState: "READY", service: "ChatService", status: "SUPPORTED" }),
  cap({ method: "removeChatsFromList", category: "Lists", layer: "lists", params: [p("listId", "string"), p("chatIds", "string[]")], returns: "void", sessionState: "READY", service: "ChatService", status: "SUPPORTED" }),
  cap({ method: "renameList", category: "Lists", layer: "lists", params: [p("listId", "string"), p("newName", "string")], returns: "void", sessionState: "READY", service: "ChatService", status: "SUPPORTED" }),
  cap({ method: "deleteList", category: "Lists", layer: "lists", params: [p("listId", "string")], returns: "void", sessionState: "READY", service: "ChatService", status: "SUPPORTED", dangerous: true }),
  // ----- Newsletter / channels -----
  cap({ method: "createNewsletter", category: "Newsletter", layer: "newsletter", params: [p("name", "string"), p("options", "{description?,picture?}", false)], returns: "any", sessionState: "READY", service: "ChannelService", endpoint: "POST /api/v1/channels", uiFeature: "Channels", status: "SUPPORTED" }),
  cap({ method: "editNewsletter", category: "Newsletter", layer: "newsletter", params: [p("id", "string"), p("opts", "{name?,description?,picture?}")], returns: "any", sessionState: "READY", service: "ChannelService", endpoint: "PATCH /api/v1/channels/:id", status: "SUPPORTED" }),
  cap({ method: "destroyNewsletter", category: "Newsletter", layer: "newsletter", params: [p("id", "string")], returns: "boolean", sessionState: "READY", service: "ChannelService", endpoint: "DELETE /api/v1/channels/:id", status: "SUPPORTED", dangerous: true }),
  cap({ method: "muteNesletter", category: "Newsletter", layer: "newsletter", params: [p("id", "string")], returns: "ChatModel", sessionState: "READY", service: "ChannelService", endpoint: "POST /api/v1/channels/:id/mute", status: "SUPPORTED" }),
  // ----- Status -----
  cap({ method: "sendTextStatus", category: "Status", layer: "status", params: [p("text", "string"), p("options", "{backgroundColor?,font?}", false)], returns: "any", sessionState: "READY", service: "StatusService", endpoint: "POST /api/v1/status/text", uiFeature: "Status", status: "SUPPORTED" }),
  cap({ method: "sendImageStatus", category: "Status", layer: "status", params: [p("pathOrBase64", "string"), p("options", "{caption?}", false)], returns: "any", sessionState: "READY", service: "StatusService", endpoint: "POST /api/v1/status/media", uiFeature: "Status", status: "SUPPORTED" }),
  cap({ method: "sendVideoStatus", category: "Status", layer: "status", params: [p("pathOrBase64", "string"), p("options", "{caption?}", false)], returns: "any", sessionState: "READY", service: "StatusService", endpoint: "POST /api/v1/status/media", uiFeature: "Status", status: "SUPPORTED" }),
  cap({ method: "sendReadStatus", category: "Status", layer: "status", params: [p("chatId", "string"), p("statusId", "string")], returns: "void", sessionState: "READY", service: "StatusService", endpoint: "POST /api/v1/status/read", status: "SUPPORTED" }),
  // ----- Media / misc -----
  cap({ method: "downloadMedia", category: "Media", layer: "whatsapp", params: [p("messageId", "string")], returns: "string(base64 data url)", sessionState: "READY", service: "MediaService", endpoint: "GET /api/v1/messages/:id/media", uiFeature: "Media preview/download", status: "SUPPORTED" }),
  cap({ method: "decryptFile", category: "Media", layer: "whatsapp", params: [p("message", "Message")], returns: "Buffer", sessionState: "READY", service: "MediaService", status: "SUPPORTED", explorer: false }),
  cap({ method: "decryptAndSaveFile", category: "Media", layer: "whatsapp", params: [p("message", "Message"), p("savePath", "string")], returns: "void", sessionState: "READY", service: "MediaService", status: "SUPPORTED", explorer: false }),
  cap({ method: "downloadFile", category: "Media", layer: "whatsapp", params: [p("data", "string")], returns: "string|boolean", sessionState: "READY", service: "MediaService", status: "SUPPORTED", explorer: false }),
  cap({ method: "subscribePresence", category: "Listener", layer: "listener", params: [p("id", "string|string[]")], returns: "number", sessionState: "READY", service: "PresenceService", endpoint: "POST /api/v1/chats/:id/presence/subscribe", uiFeature: "Inbox presence", status: "SUPPORTED" }),
  cap({ method: "unsubscribePresence", category: "Listener", layer: "listener", params: [p("id", "string|string[]")], returns: "number", sessionState: "READY", service: "PresenceService", status: "SUPPORTED" }),
];

/** Listener-layer events wired in event-bridge.ts (not callable from explorer). */
export const LISTENERS = [
  { method: "onMessage", wsEvent: "message.received", used: true }, { method: "onAnyMessage", wsEvent: "message.sent/received", used: true },
  { method: "onAck", wsEvent: "message.delivered/read", used: true }, { method: "onStateChange", wsEvent: "session.status", used: true },
  { method: "onStreamChange", wsEvent: "session.status", used: true }, { method: "onMessageEdit", wsEvent: "message.edited", used: true },
  { method: "onRevokedMessage", wsEvent: "message.deleted", used: true }, { method: "onReactionMessage", wsEvent: "reaction.received", used: true },
  { method: "onPresenceChanged", wsEvent: "presence.changed", used: true }, { method: "onParticipantsChanged", wsEvent: "group.updated", used: true },
  { method: "onAddedToGroup", wsEvent: "group.updated", used: true }, { method: "onNewChat", wsEvent: "chat.updated", used: true },
  { method: "onIncomingCall", wsEvent: "system.log", used: true }, { method: "onPollResponse", wsEvent: "message.received", used: true },
  { method: "onUpdateLabel", wsEvent: "contact.updated", used: true }, { method: "onNotificationMessage", wsEvent: "message.received", used: true },
  { method: "onLiveLocation", wsEvent: "-", used: false }, { method: "onOrderStatusUpdate", wsEvent: "-", used: false },
  { method: "onInterfaceChange", wsEvent: "session.status", used: true }, { method: "onStreamModeChanged", wsEvent: "-", used: false },
  { method: "onStreamInfoChanged", wsEvent: "-", used: false }, { method: "onBackendEvent", wsEvent: "-", used: false },
];

const byMethod = new Map(CAPABILITIES.map((c) => [c.method, c]));
export const getCapability = (m: string) => byMethod.get(m);

/** Introspect the real installed Whatsapp class (prototype chain across all layers). */
export function discoverRuntimeMethods(): string[] {
  const names = new Set<string>();
  let proto = Whatsapp.prototype as object | null;
  while (proto && proto !== Object.prototype) {
    for (const n of Object.getOwnPropertyNames(proto)) {
      if (n === "constructor" || n.startsWith("_") || n.startsWith("on")) continue;
      const d = Object.getOwnPropertyDescriptor(proto, n);
      if (d && typeof d.value === "function") names.add(n);
    }
    proto = Object.getPrototypeOf(proto);
  }
  // Exclude obviously internal/protected helpers declared in typings as protected/private.
  // protected/internal members of the layers (typed `protected` in the .d.ts) – not part of the public API surface
  const internal = new Set(["afterPageScriptInjected", "afterPageLoad", "initialize", "catchQR", "statusFind", "onLoadingScreen", "addChatWppListeners", "registerEvent", "unregisterEvent", "convertToEvent", "cancelAutoClose", "tryAutoClose", "startAutoClose", "checkInChat", "checkQrCode", "checkStart", "log", "loginByCode"]);
  return [...names].filter((n) => !internal.has(n)).sort();
}

export function runCapabilityAudit() {
  const runtime = discoverRuntimeMethods();
  const runtimeSet = new Set(runtime);
  const mapped = CAPABILITIES.filter((c) => runtimeSet.has(c.method));
  const unavailable = CAPABILITIES.filter((c) => !runtimeSet.has(c.method)).map((c) => c.method);
  const unmapped = runtime.filter((m) => !byMethod.has(m));
  const deprecated = mapped.filter((c) => c.deprecated).map((c) => c.method);
  return {
    version: getWppVersion(), runtimeMethodCount: runtime.length, mapped: mapped.length, deprecated: deprecated.length, unsupportedByVersion: unavailable.length, unmapped: unmapped.length,
    deprecatedMethods: deprecated, unsupportedMethods: unavailable, unmappedMethods: unmapped, listeners: LISTENERS,
  };
}
export function getWppVersion(): string {
  try { return (require("@wppconnect-team/wppconnect/package.json") as { version: string }).version; } catch { return "unknown"; }
}
