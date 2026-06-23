// ============================================================
// GET    /api/departments/[id]/members  — list members (any member)
// POST   /api/departments/[id]/members  — add member (admin+)
// DELETE /api/departments/[id]/members  — remove member (admin+)
// ============================================================

import { NextResponse } from "next/server";

import {
  getCurrentAccount,
  requireRole,
  toErrorResponse,
} from "@/lib/auth/account";
import { canManageMembers } from "@/lib/auth/roles";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await getCurrentAccount();
    const { id: departmentId } = await params;

    // Get member userIds for this department (RLS filters by account).
    const { data: memberRows, error } = await ctx.supabase
      .from("department_members")
      .select("id, user_id, created_at")
      .eq("department_id", departmentId)
      .order("created_at", { ascending: true });

    if (error) {
      console.error("[GET /api/departments/[id]/members] fetch error:", error);
      return NextResponse.json(
        { error: "Failed to load members" },
        { status: 500 },
      );
    }

    if (!memberRows || memberRows.length === 0) {
      return NextResponse.json({ members: [] });
    }

    // Get profile info for those userIds.
    const userIds = memberRows.map((m) => m.user_id as string);
    const { data: profiles, error: profileErr } = await ctx.supabase
      .from("profiles")
      .select("user_id, full_name, email, avatar_url")
      .in("user_id", userIds);

    if (profileErr) {
      console.error(
        "[GET /api/departments/[id]/members] profile fetch error:",
        profileErr,
      );
      return NextResponse.json(
        { error: "Failed to load member profiles" },
        { status: 500 },
      );
    }

    const profileMap = new Map(
      (profiles ?? []).map((p) => [p.user_id as string, p]),
    );
    // Gate email behind admin+ (same ACL as GET /api/account/members).
    const canSeeEmails = canManageMembers(ctx.role);
    const members = memberRows.map((m) => {
      const p = profileMap.get(m.user_id as string);
      return {
        id: m.id,
        user_id: m.user_id,
        full_name: p?.full_name ?? null,
        email: canSeeEmails ? (p?.email ?? null) : null,
        avatar_url: p?.avatar_url ?? null,
        created_at: m.created_at,
      };
    });

    return NextResponse.json({ members });
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await requireRole("admin");
    const { id: departmentId } = await params;

    const body = await request.json().catch(() => null);
    if (!body) {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const { user_id } = body as { user_id?: unknown };

    if (typeof user_id !== "string" || user_id.trim().length === 0) {
      return NextResponse.json(
        { error: "user_id is required" },
        { status: 400 },
      );
    }

    // Verify the department belongs to the caller's account.
    // Without this, an admin could insert a member row tagged with
    // their own account_id but pointing at a foreign department —
    // the denormalised account_id is what future RLS will trust.
    const { data: dept, error: deptErr } = await ctx.supabase
      .from("departments")
      .select("id")
      .eq("id", departmentId)
      .eq("account_id", ctx.accountId)
      .single();

    if (deptErr || !dept) {
      return NextResponse.json(
        { error: "Department not found" },
        { status: 404 },
      );
    }

    // Verify the target user is a member of the caller's account.
    const { data: profile, error: profileErr } = await ctx.supabase
      .from("profiles")
      .select("user_id")
      .eq("account_id", ctx.accountId)
      .eq("user_id", user_id)
      .single();

    if (profileErr || !profile) {
      return NextResponse.json(
        { error: "User is not an account member" },
        { status: 400 },
      );
    }

    const { data, error } = await ctx.supabase
      .from("department_members")
      .insert({
        account_id: ctx.accountId,
        department_id: departmentId,
        user_id,
      })
      .select()
      .single();

    if (error) {
      // unique_violation on (department_id, user_id) — code 23505
      if (error.code === "23505") {
        return NextResponse.json(
          { error: "User is already a member of this department" },
          { status: 409 },
        );
      }
      console.error(
        "[POST /api/departments/[id]/members] insert error:",
        error,
      );
      return NextResponse.json(
        { error: "Failed to add member to department" },
        { status: 500 },
      );
    }

    return NextResponse.json({ member: data }, { status: 201 });
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await requireRole("admin");
    const { id: departmentId } = await params;

    // Accept user_id from either the request body or the query string.
    let userId: string | undefined;
    const url = new URL(request.url);
    userId = url.searchParams.get("user_id") ?? undefined;

    if (!userId) {
      const body = await request.json().catch(() => null);
      if (body && typeof body.user_id === "string") {
        userId = body.user_id;
      }
    }

    if (!userId) {
      return NextResponse.json(
        { error: "user_id is required (query param or body)" },
        { status: 400 },
      );
    }

    const { error, count } = await ctx.supabase
      .from("department_members")
      .delete({ count: "exact" })
      .eq("department_id", departmentId)
      .eq("user_id", userId);

    if (error) {
      console.error(
        "[DELETE /api/departments/[id]/members] delete error:",
        error,
      );
      return NextResponse.json(
        { error: "Failed to remove member from department" },
        { status: 500 },
      );
    }

    if (count === 0) {
      return NextResponse.json(
        { error: "Membership not found" },
        { status: 404 },
      );
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    return toErrorResponse(err);
  }
}
