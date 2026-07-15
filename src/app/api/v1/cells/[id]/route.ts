import type { NextRequest } from "next/server"
import { fromActionResult } from "@/lib/api/action"
import { requireApiListContext } from "@/lib/api/auth"
import { notFound } from "@/lib/api/errors"
import { jsonError, jsonOk } from "@/lib/api/http"
import { parseJsonBody } from "@/lib/api/parse"
import { deleteGroup, saveGroup } from "@/lib/groups/actions"
import { listGroups } from "@/lib/groups/data"

type Context = { params: Promise<{ id: string }> }
export async function GET(request: NextRequest, context: Context) { try { const { id } = await context.params; const { companyId } = await requireApiListContext(request, "cells.view"); const data = await listGroups({ companyId, type: "cell", pageSize: 100 }); const cell = data.groups.find((item) => item.id === id); if (!cell) throw notFound("Célula não encontrada"); return jsonOk(cell) } catch (error) { return jsonError(error) } }
export async function PATCH(request: NextRequest, context: Context) { try { const { id } = await context.params; const body = await parseJsonBody(request); return fromActionResult(await saveGroup({ ...(body as object), id, type: "cell" } as Parameters<typeof saveGroup>[0])) } catch (error) { return jsonError(error) } }
export async function DELETE(request: NextRequest, context: Context) { try { const { id } = await context.params; return fromActionResult(await deleteGroup({ id, companyId: request.nextUrl.searchParams.get("companyId") })) } catch (error) { return jsonError(error) } }
