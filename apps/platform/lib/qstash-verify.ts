import { Receiver } from "@upstash/qstash";
import { z } from "zod";

const claimsSchema = z.object({ sub: z.string().url() });

/**
 * Checks a QStash callback: the signature must be valid for this body AND the
 * signed destination (`sub`) must be this route's path. Without the path check a
 * signed message meant for one job could be replayed to another job's route.
 * Only the path is compared, so the same job works on every domain we serve.
 * Throws when either check fails.
 */
export async function verifyQstashCallback(input: {
    currentSigningKey: string;
    nextSigningKey: string;
    signature: string;
    body: string;
    requestUrl: string;
}): Promise<void> {
    const { currentSigningKey, nextSigningKey, signature, body, requestUrl } = input;
    await new Receiver({ currentSigningKey, nextSigningKey }).verify({ signature, body });
    // verify() has checked the JWT signature, so its claims can be trusted here.
    const payload = signature.split(".")[1] ?? "";
    const claims = claimsSchema.parse(JSON.parse(Buffer.from(payload, "base64url").toString("utf8")));
    if (new URL(claims.sub).pathname !== new URL(requestUrl).pathname) {
        throw new Error("QStash message was signed for another route");
    }
}
