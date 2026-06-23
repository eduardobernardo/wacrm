// ============================================================
// GET  /api/departments       — list departments (any member)
// POST /api/departments       — create a department (admin+)
// ============================================================

import { NextResponse } from "next/server";

import { getCurrentAccount, requireRole, toErrorResponse } from "@/lib/auth/account";
import {
  DEFAULT_DEPARTMENT_COLOR,
  isDepartmentColor,
} from "@/lib/departments/colors";
import type { Department } from "@/types";

export async function GET() {
  try {
    const ctx = await getCurrentAccount();

    const { data: departments, error } = await ctx.supabase
      .from("departments")
      .select("*")
      .eq("account_id", ctx.accountId)
      .order("name", { ascending: true });

    if (error) {
      console.error("[GET /api/departments] fetch error:", error);
      return NextResponse.json(
        { error: "Failed to load departments" },
        { status: 500 },
      );
    }

    // Fetch member counts in one query (grouped by department_id).
    const memberCounts = new Map<string, number>();
    if (departments && departments.length > 0) {
      const deptIds = departments.map((d) => d.id);
      const { data: rows, error: countErr } = await ctx.supabase
        .from("department_members")
        .select("department_id")
        .in("department_id", deptIds);

      if (!countErr && rows) {
        for (const row of rows) {
          const deptId = row.department_id as string;
          memberCounts.set(deptId, (memberCounts.get(deptId) ?? 0) + 1);
        }
      }
    }

    const result = (departments ?? []).map((d) => ({
      ...d,
      member_count: memberCounts.get(d.id as string) ?? 0,
    }));

    return NextResponse.json({ departments: result });
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function POST(request: Request) {
  try {
    const ctx = await requireRole("admin");

    const body = await request.json().catch(() => null);
    if (!body) {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const { name, description, color } = body as {
      name?: unknown;
      description?: unknown;
      color?: unknown;
    };

    if (typeof name !== "string" || name.trim().length === 0) {
      return NextResponse.json(
        { error: "Department name is required" },
        { status: 400 },
      );
    }

    // Default the swatch to slate if the client omits it. Reject
    // anything outside the curated palette so the DB CHECK never
    // trips at insert time.
    const safeColor = isDepartmentColor(color) ? color : DEFAULT_DEPARTMENT_COLOR;

    const insert: Record<string, unknown> = {
      account_id: ctx.accountId,
      name: name.trim(),
      color: safeColor,
    };
    if (typeof description === "string" && description.trim().length > 0) {
      insert.description = description.trim();
    }

    const { data, error } = await ctx.supabase
      .from("departments")
      .insert(insert)
      .select()
      .single();

    if (error) {
      // unique_violation on (account_id, name) — code 23505
      if (error.code === "23505") {
        return NextResponse.json(
          { error: "A department with this name already exists" },
          { status: 409 },
        );
      }
      console.error("[POST /api/departments] insert error:", error);
      return NextResponse.json(
        { error: "Failed to create department" },
        { status: 500 },
      );
    }

    return NextResponse.json({ department: data as Department }, { status: 201 });
  } catch (err) {
    return toErrorResponse(err);
  }
}
