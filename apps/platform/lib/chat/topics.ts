// Single source of truth for Realtime topic names. MUST match the SQL builders
// chat_topic_conversation / chat_topic_user and the realtime RLS policies.
export const conversationTopic = (conversationId: string) => `chat:conv:${conversationId}`;
// Typing lives on a SEPARATE channel from messages. realtime-js dedupes channels
// by topic, so sharing `chat:conv:<id>` between the messages hook and the typing
// hook made each hook's cleanup tear down the other's listeners. The `:typing`
// suffix still authorizes via the same conversation membership (chat_topic_conv_id
// extracts the uuid prefix).
export const typingTopic = (conversationId: string) => `chat:conv:${conversationId}:typing`;
export const userInboxTopic = (userId: string) => `chat:user:${userId}`;
export const tenantPresenceTopic = (tenantId: string) => `chat:tenant:${tenantId}:presence`;
