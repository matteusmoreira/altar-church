import { fromActionResult } from "@/lib/api/action";
import { badRequest } from "@/lib/api/errors";
import { jsonError } from "@/lib/api/http";
import { uploadVolunteerShiftFile } from "@/lib/volunteers/v2-actions";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    if (
      !(request.headers.get("content-type") ?? "").includes(
        "multipart/form-data",
      )
    ) {
      throw badRequest("Envie multipart/form-data com o campo file");
    }
    const { id } = await context.params;
    const formData = await request.formData();
    formData.set("shiftId", id);
    return fromActionResult(await uploadVolunteerShiftFile(formData), {
      successStatus: 201,
    });
  } catch (error) {
    return jsonError(error);
  }
}
