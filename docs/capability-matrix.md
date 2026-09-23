# Capability matrix

The authoritative, always-current matrix is served by `GET /api/v1/developer/capabilities` and rendered at **Developer → Capabilities**. It is generated from `src/server/wpp/capability-registry.ts` plus runtime introspection of the installed `Whatsapp` class.

Summary for WPPConnect 2.3.3 (from `runCapabilityAudit()`):

| Category | Methods (examples) | Exposure |
|---|---|---|
| Host | getHostDevice, getWid, getWAVersion, getConnectionState, isConnected, isAuthenticated, getBatteryLevel, takeScreenshot, useHere, logout, close | Sessions page, diagnostics, explorer |
| Chat | listChats, getChatById, sendSeen, markUnseenMessage, archiveChat, pinChat, sendMute, clearChat, deleteChat, getChatIsOnline, getLastSeen, startTyping/stopTyping/startRecording/stopRecording, setOnlinePresence, subscribePresence | Inbox, contact panel |
| Message | getMessages, getMessageById, sendText, sendReactionToMessage, editMessage, deleteMessage, starMessage, forwardMessagesV2, sendLocation, sendContactVcard, sendPollMessage, sendListMessage, getReactions, getVotes, markPlayed | Inbox, composer, REST |
| Media | sendFile, sendImage, sendPtt(FromBase64), sendImageAsSticker, sendVideoAsGif, downloadMedia, decryptFile | Composer, media proxy |
| Contact | getAllContacts, getContact, checkNumberStatus, getProfilePicFromServer, getStatus, blockContact/unblockContact, getBlockList, getCommonGroups, getPnLidEntry | Contacts, CRM profile |
| Group | createGroup, getGroupMembers, getGroupAdmins, addParticipant, removeParticipant, promoteParticipant, demoteParticipant, setGroupSubject/Description/Property/Icon, getGroupInviteLink, revokeGroupInviteLink, joinGroup, leaveGroup, membership requests | Groups |
| Community | createCommunity, deactivateCommunity, add/removeSubgroupsCommunity, promote/demoteCommunityParticipant, getCommunityParticipants | Explorer |
| Profile / Business | getProfileName/Status, setProfileName/Status/Pic, removeMyProfilePicture, getBusinessProfile, editBusinessProfile | Catalog → Business profile |
| Catalog | getProducts, getProductById, createProduct, editProduct, delProducts, setProductVisibility, getCollections, create/edit/deleteCollection, add/change/removeProductImage, updateCartEnabled, sendImageWithProduct, getBusinessProfilesProducts | Catalog page + explorer |
| Labels | getAllLabels, addNewLabel, deleteLabel, deleteAllLabels, getLabelById, addOrRemoveLabels | Labels (native tab) |
| Lists | createList, getAllLists, addChatsToList, removeChatsFromList, renameList, deleteList | Explorer |
| Newsletter | createNewsletter, editNewsletter, destroyNewsletter, muteNesletter | Channels |
| Status | sendTextStatus, sendImageStatus, sendVideoStatus, sendReadStatus | Status page |
| UI | openChat, openChatAt, closeChat, getActiveChat, getTheme, setTheme, get/setAutoDownloadSettings | Explorer |
| Deprecated | getAllChats, getAllChatsWithMessages, getAllGroups, getChat, getAllMessagesInChat, loadAndGetAllMessagesInChat, loadEarlierMessages, getAllNewMessages, getUnreadMessages, getNumberProfile, sendMentioned, reply, sendMessageOptions, forwardMessage, stopRecoring, setChatState | flagged, explorer only |

Test status per method (SUPPORTED / ERROR / NOT TESTED) is persisted in `capability_tests` when executed from the explorer.
