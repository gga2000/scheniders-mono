import { describe, it, expect } from "vitest";
import { conversationTopic, userInboxTopic, tenantPresenceTopic } from "./topics";

describe("chat topics", () => {
    it("builds a conversation topic", () => {
        expect(conversationTopic("abc")).toBe("chat:conv:abc");
    });
    it("builds a user inbox topic", () => {
        expect(userInboxTopic("u1")).toBe("chat:user:u1");
    });
    it("builds a tenant presence topic", () => {
        expect(tenantPresenceTopic("t1")).toBe("chat:tenant:t1:presence");
    });
});
