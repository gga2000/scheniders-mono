import { passwordIsWeak } from "@/lib/password-policy";
import type { createSupabaseServiceClient } from "@/lib/supabase-server";

/**
 * A weak password is accepted (lib/password-policy.ts); a week later its owner
 * is asked to pick a stronger one, and "remind me later" asks again a week on.
 */
export const PASSWORD_REMINDER_DAYS = 7;

export function passwordReminderAt(now: number = Date.now()): string {
    return new Date(now + PASSWORD_REMINDER_DAYS * 24 * 60 * 60 * 1000).toISOString();
}

type ServiceClient = ReturnType<typeof createSupabaseServiceClient>;

/**
 * After an account's password was set: a weak one gets (or keeps) a reminder
 * a week from now, any other clears it. `userId` is always the account the
 * password was just set on, never one the request named.
 */
export async function recordPasswordStrength(admin: ServiceClient, userId: string, password: string): Promise<void> {
    if (passwordIsWeak(password)) {
        const { error } = await admin
            .from("password_reminders")
            .upsert({ user_id: userId, remind_at: passwordReminderAt() }, { onConflict: "user_id" });
        if (error) throw new Error(`password_reminders upsert: ${error.message}`);
        return;
    }
    const { error } = await admin.from("password_reminders").delete().eq("user_id", userId);
    if (error) throw new Error(`password_reminders delete: ${error.message}`);
}

/** "Remind me later": the signed-in account is asked again a week from now. Nothing for an account with no reminder. */
export async function snoozePasswordReminder(admin: ServiceClient, userId: string): Promise<void> {
    const { error } = await admin
        .from("password_reminders")
        .update({ remind_at: passwordReminderAt() })
        .eq("user_id", userId);
    if (error) throw new Error(`password_reminders snooze: ${error.message}`);
}
