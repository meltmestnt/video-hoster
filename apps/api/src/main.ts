import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { ConfigService } from "@nestjs/config";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import express from "express";
import { AppModule } from "./app.module";
import { TrpcService } from "./trpc/trpc.service";

async function bootstrap() {
  // Disable Nest's built-in body parser so we can mount raw-body parsing
  // on the LemonSqueezy webhook route specifically. The HMAC-SHA256 signature
  // check needs the unmodified bytes; everywhere else still gets JSON.
  const app = await NestFactory.create(AppModule, { bodyParser: false });
  const expressApp = app.getHttpAdapter().getInstance() as express.Express;

  expressApp.use(
    "/webhook/lemonsqueezy",
    express.raw({ type: "application/json", limit: "1mb" }),
    (req, _res, next) => {
      // Stash the raw bytes where the controller can read them; the
      // controller parses JSON itself since we already have the bytes.
      (req as express.Request & { rawBody?: Buffer }).rawBody =
        req.body as Buffer;
      next();
    },
  );
  expressApp.use(express.json({ limit: "10mb" }));
  expressApp.use(express.urlencoded({ extended: true, limit: "10mb" }));

  const config = app.get(ConfigService);

  app.enableCors({
    origin: config.get<string>("WEB_ORIGIN") ?? "http://localhost:3000",
    credentials: true,
  });

  const trpc = app.get(TrpcService);
  app.use(
    "/trpc",
    createExpressMiddleware({
      router: trpc.router,
      createContext: trpc.createContext,
    }),
  );

  const port = Number(config.get<string>("PORT") ?? 4000);
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`[api] listening on http://localhost:${port}`);
}

bootstrap();
