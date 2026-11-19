// One file route: the static brand-guidelines/deck file (PDF or PPTX), uploaded once per client on the Campaigns page.
// UploadThingError for "pdf"/"blob" are the only built-in categories; PPTX has no dedicated one, so it goes through "blob"
// and gets checked by name/type in middleware instead.
import { ObjectId } from "mongodb";
import { createUploadthing, type FileRouter } from "uploadthing/next";
import { UploadThingError } from "uploadthing/server";
import { currentUser } from "@/lib/session";
import { db } from "@/lib/db";

const f = createUploadthing();

const PPT_TYPES = new Set([
  "application/vnd.openxmlformats-officedocument.presentationml.presentation", // .pptx
  "application/vnd.ms-powerpoint", // .ppt
]);

// A tiny hand-rolled parser (satisfies uploadthing's ParserZodEsque shape) so this doesn't need a zod dependency just for one string field.
// _input/_output are type-only markers uploadthing never reads at runtime.
const clientIdInput = {
  parseAsync: async (v: unknown) => {
    const id = (v as { clientId?: unknown } | null)?.clientId;
    if (typeof id !== "string" || !ObjectId.isValid(id)) throw new Error("bad clientId");
    return { clientId: id };
  },
} as { _input: { clientId: string }; _output: { clientId: string }; parseAsync: (v: unknown) => Promise<{ clientId: string }> };

export const ourFileRouter = {
  brandFile: f({ pdf: { maxFileSize: "16MB", maxFileCount: 1 }, blob: { maxFileSize: "16MB", maxFileCount: 1 } })
    .input(clientIdInput)
    .middleware(async ({ input, files }) => {
      if (!(await currentUser())) throw new UploadThingError("sign in first");
      const file = files[0];
      if (file.type !== "application/pdf" && !PPT_TYPES.has(file.type) && !/\.(pdf|pptx?)$/i.test(file.name)) {
        throw new UploadThingError("upload a PDF or PowerPoint file (.pdf, .pptx, .ppt)");
      }
      return { clientId: input.clientId };
    })
    .onUploadComplete(async ({ metadata, file }) => {
      await (await db()).clients.updateOne({ _id: new ObjectId(metadata.clientId) }, { $set: { guidelinesFileUrl: file.ufsUrl, guidelinesFileName: file.name } });
    }),
} satisfies FileRouter;

export type OurFileRouter = typeof ourFileRouter;
