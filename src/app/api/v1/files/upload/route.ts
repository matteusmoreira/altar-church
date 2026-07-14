import { fromActionResult } from "@/lib/api/action"
import { badRequest } from "@/lib/api/errors"
import { jsonError } from "@/lib/api/http"
import { uploadEntityAsset } from "@/lib/files/actions"

export async function POST(request: Request) {
  try {
    const contentType = request.headers.get("content-type") ?? ""
    if (!contentType.includes("multipart/form-data")) {
      throw badRequest("Envie multipart/form-data com o campo file")
    }
    const formData = await request.formData()
    const result = await uploadEntityAsset(formData)
    return fromActionResult(result, { successStatus: 201 })
  } catch (error) {
    return jsonError(error)
  }
}
