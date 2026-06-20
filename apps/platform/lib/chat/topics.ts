// Single source of truth for Realtime topic names. MUST match the SQL builders
// chat_topic_conversation / chat_topic_user and the realtime RLS policies.
export const conversationTopic = (conversationId: string) => `chat:conv:${conversationId}`;
export const userInboxTopic = (userId: string) => `chat:user:${userId}`;
export const tenantPresenceTopic = (tenantId: string) => `chat:tenant:${tenantId}:presence`;
