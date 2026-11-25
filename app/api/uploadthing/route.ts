import { createRouteHandler } from "uploadthing/next";
import { ourFileRouter } from "./core";

// Outside the proxy's login matcher (everything under /api/ is), so the real gate is ourFileRouter's own middleware (currentUser()).
export const { GET, POST } = createRouteHandler({ router: ourFileRouter });
