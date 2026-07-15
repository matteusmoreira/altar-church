import { jsonError, jsonOk } from "@/lib/api/http"
import { uploadCellPhotos } from "@/lib/cells/actions"
type Context = { params: Promise<{ id: string }> }
export async function POST(request: Request, context: Context) { try { const data = await request.formData(); data.set("meetingId", (await context.params).id); const result = await uploadCellPhotos(data); if (!result.ok) throw new Error(result.error); return jsonOk({ id: result.id }, { status: 201 }) } catch (error) { return jsonError(error) } }
