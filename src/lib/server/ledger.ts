/**
 * Conversation stamps: a hash of message id + ciphertext, no who-talked-to-whom
 * admin tree, no decrypt path, no site-owner secret.
 */
import { gzipSync } from "node:zlib";
import { getSql } from "@/lib/db";
import { sha256Hex } from "@/lib/sanctum/crypto";
import { newId, nowIso } from "./ids";

export async function stampConversation(input: {
  conversationId: string;
  messageId: string;
  ciphertext: string;
}): Promise<void> {
  try {
    const sql = await getSql();
    const eventHash = await sha256Hex(`${input.messageId}|${input.ciphertext}`);
    await sql`
      insert into conversation_stamps (id, message_id, conversation_id, event_hash, created_at)
      values (${newId()}, ${input.messageId}, ${input.conversationId}, ${eventHash}, ${nowIso()})
    `;
  } catch {
    /* stamp must never fail a send */
  }
}

export async function archiveColdLogs(): Promise<void> {
  try {
    const sql = await getSql();
    const cutoff = new Date(Date.now() - 14 * 86400000).toISOString();
    const acts = await sql<{ id: string; event_type: string; key_id: string | null; payload: string; created_at: string }>`
      select id, event_type, key_id, payload, created_at from activity_log
      where created_at < ${cutoff}
      order by created_at
      limit 400
    `;
    if (acts.length >= 40) {
      const blob = gzipSync(Buffer.from(JSON.stringify(acts), "utf8")).toString("base64");
      await sql`
        insert into activity_log_archive (id, gzip_b64, row_count)
        values (${newId()}, ${blob}, ${acts.length})
      `;
      for (const r of acts) {
        await sql`delete from activity_log where id = ${r.id}`;
      }
    }
  } catch {
    /* archive is best-effort */
  }
}
