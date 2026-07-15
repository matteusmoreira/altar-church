import { jsonError, jsonOk } from "@/lib/api/http"
import { closeCellCheckin, openCellCheckin } from "@/lib/cells/actions"
type Context = { params: Promise<{ id: string }> }
export async function POST(_request: Request, context: Context) { try { const result = await openCellCheckin((await context.params).id); if (!result.ok) throw new Error(result.error); return jsonOk({ id: result.id, token: result.token }, { status: 201 }) } catch (error) { return jsonError(error) } }
export async function DELETE(_request: Request, context: Context) { try { const result = await closeCellCheckin((await context.params).id); if (!result.ok) throw new Error(result.error); return jsonOk({ id: result.id }) } catch (error) { return jsonError(error) } }
