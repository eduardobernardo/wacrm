// ============================================================
// GET    /api/departments/[id]  — single department + member count (any member)
// PATCH  /api/departments/[id]  — update name/description (admin+)
// DELETE /api/departments/[id]  — delete department (admin+)
// ============================================================

import { NextResponse } from "next/server";

import {
  getCurrentAccount,
  requireRole,
  toErrorResponse,
} from "@/lib/auth/account";
import { isDepartmentColor } from "@/lib/departments/colors";
import type { Department } from "@/types";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await getCurrentAccount();
    const { id } = await params;

    const { data: department, error } = await ctx.supabase
      .from("departments")
      .select("*")
      .eq("id", id)
      .eq("account_id", ctx.accountId)
      .single();

    if (error || !department) {
      return NextResponse.json(
        { error: "Department not found" },
        { status: 404 },
      );
    }

    const { count, error: countErr } = await ctx.supabase
      .from("department_members")
      .select("id", { count: "exact", head: true })
      .eq("department_id", id)
      .eq("account_id", ctx.accountId);

    if (countErr) {
      console.error("[GET /api/departments/[id]] member count error:", countErr);
    }

    return NextResponse.json({
      department: department as Department,
      member_count: count ?? 0,
    });
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await requireRole("admin");
    const { id } = await params;

    const body = await request.json().catch(() => null);
    if (!body) {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const { name, description, color } = body as {
      name?: unknown;
      description?: unknown;
      color?: unknown;
    };

    const update: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if (name !== undefined) {
      if (typeof name !== "string" || name.trim().length === 0) {
        return NextResponse.json(
          { error: "Department name must be a non-empty string" },
          { status: 400 },
        );
      }
      update.name = name.trim();
    }

    if (description !== undefined) {
      // Allow clearing description with null or empty string
      update.description =
        typeof description === "string" && description.trim().length > 0
          ? description.trim()
          : null;
    }

    if (color !== undefined) {
      if (!isDepartmentColor(color)) {
        return NextResponse.json(
          { error: "Invalid department color" },
          { status: 400 },
        );
      }
      update.color = color;
    }

    const { data, error } = await ctx.supabase
      .from("departments")
      .update(update)
      .eq("id", id)
      .eq("account_id", ctx.accountId)
      .select()
      .single();

    if (error) {
      if (error.code === "23505") {
        return NextResponse.json(
          { error: "A department with this name already exists" },
          { status: 409 },
        );
      }
      console.error("[PATCH /api/departments/[id]] update error:", error);
      return NextResponse.json(
        { error: "Failed to update department" },
        { status: 500 },
      );
    }

    if (!data) {
      return NextResponse.json(
        { error: "Department not found" },
        { status: 404 },
      );
    }

    return NextResponse.json({ department: data as Department });
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await requireRole("admin");
    const { id } = await params;

    const { error, count } = await ctx.supabase
      .from("departments")
      .delete({ count: "exact" })
      .eq("id", id)
      .eq("account_id", ctx.accountId);

    if (error) {
      console.error("[DELETE /api/departments/[id]] error:", error);
      return NextResponse.json(
        { error: "Failed to delete department" },
        { status: 500 },
      );
    }

    if (count === 0) {
      return NextResponse.json(
        { error: "Department not found" },
        { status: 404 },
      );
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    return toErrorResponse(err);
  }
}
