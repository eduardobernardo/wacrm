// ============================================================
// POST /api/conversations/[id]/transfer  — transfer a conversation
// ============================================================

import { NextResponse } from "next/server";

import { requireRole, toErrorResponse } from "@/lib/auth/account";
import { applyRouting } from "@/lib/departments/distribute";
import type { RouteTarget } from "@/lib/departments/types";
import { supabaseAdmin } from "@/lib/supabase/admin-client";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await requireRole("agent");
    const { id: conversationId } = await params;

    const body = await request.json().catch(() => null);
    if (!body) {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const target = body as RouteTarget;
    if (!target.kind || !["department", "department_user", "user"].includes(target.kind)) {
      return NextResponse.json(
        { error: "Invalid target kind" },
        { status: 400 },
      );
    }

    // Validate target fields are scoped to this account.
    const adminDb = supabaseAdmin();

    if (target.kind === "user") {
      const { data: profile } = await adminDb
        .from("profiles")
        .select("user_id")
        .eq("account_id", ctx.accountId)
        .eq("user_id", target.user_id)
        .single();
      if (!profile) {
        return NextResponse.json(
          { error: "Target user is not an account member" },
          { status: 400 },
        );
      }
    }

    if (target.kind === "department") {
      if (target.strategy !== "auto" && target.strategy !== "sequential") {
        return NextResponse.json(
          { error: "Invalid strategy — must be auto or sequential" },
          { status: 400 },
        );
      }
      const { data: dept } = await adminDb
        .from("departments")
        .select("id")
        .eq("id", target.department_id)
        .eq("account_id", ctx.accountId)
        .single();
      if (!dept) {
        return NextResponse.json(
          { error: "Department not found" },
          { status: 404 },
        );
      }
    }

    if (target.kind === "department_user") {
      const { data: dept } = await adminDb
        .from("departments")
        .select("id")
        .eq("id", target.department_id)
        .eq("account_id", ctx.accountId)
        .single();
      if (!dept) {
        return NextResponse.json(
          { error: "Department not found" },
          { status: 404 },
        );
      }
      const { data: profile } = await adminDb
        .from("profiles")
        .select("user_id")
        .eq("account_id", ctx.accountId)
        .eq("user_id", target.user_id)
        .single();
      if (!profile) {
        return NextResponse.json(
          { error: "Target user is not an account member" },
          { status: 400 },
        );
      }
    }

    // Verify the caller can see this conversation (RLS-gated).
    const { data: conversation, error: convErr } = await ctx.supabase
      .from("conversations")
      .select("id, account_id")
      .eq("id", conversationId)
      .eq("account_id", ctx.accountId)
      .single();

    if (convErr || !conversation) {
      return NextResponse.json(
        { error: "Conversation not found" },
        { status: 404 },
      );
    }

    // Use service-role client for routing so auto/sequential strategies
    // see the true department load, not the caller's RLS-scoped view.
    await applyRouting(adminDb, conversationId, ctx.accountId, target, {
      source: "inbox",
      transferredBy: ctx.userId,
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    return toErrorResponse(err);
  }
}
