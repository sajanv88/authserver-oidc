// nextidp for NestJS: a module, a guard that checks the bearer token on every HTTP request
// (unless a route is @Public()), @Scopes() for what a route needs, and @CurrentToken().
//
// Written without decorator syntax: the decorators are applied as calls, with explicit
// injection tokens, so the build needs neither experimentalDecorators nor the type metadata
// Nest's own compiler emits, and works with Nest 11 (CommonJS) and 12 (ES modules) alike.
import {
  type CanActivate,
  createParamDecorator,
  type DynamicModule,
  type ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
  Module,
  type Provider,
  ServiceUnavailableException,
  SetMetadata,
  UnauthorizedException,
} from "@nestjs/common";
import { APP_GUARD, Reflector } from "@nestjs/core";
import { type AccessToken, bearerChallenge } from "./access-token.js";
import type { IdpOptions } from "./config.js";
import { isTokenError } from "./errors.js";
import { createIdp, type Idp } from "./idp.js";

/** The injection token of the `Idp` instance the module was given. */
export const IDP = "nextidp:idp";
const SCOPES_KEY = "nextidp:scopes";
const PUBLIC_KEY = "nextidp:public";

/** Every one of these scopes is needed. On a controller, they add to its routes' own. */
export const Scopes = (...scopes: string[]) => SetMetadata(SCOPES_KEY, scopes);

/** No token needed for this route (or every route of this controller). */
export const Public = () => SetMetadata(PUBLIC_KEY, true);

/** The checked access token of this request: `list(@CurrentToken() token: AccessToken)`. */
export const CurrentToken = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AccessToken | undefined =>
    context.switchToHttp().getRequest<{ idp?: { token: AccessToken } }>().idp?.token,
);

type HttpRequest = {
  headers?: Record<string, string | string[] | undefined>;
  idp?: { token: AccessToken };
};
type HttpResponse = {
  setHeader?: (name: string, value: string) => unknown;
  header?: (name: string, value: string) => unknown;
};

/**
 * Checks the bearer token of every HTTP request it guards: a missing or bad token is 401, a
 * missing scope 403 (each with WWW-Authenticate, RFC 6750), and a token that can't be checked
 * now 503. Only HTTP: on any other kind of context it refuses, rather than let a call through.
 */
export class IdpGuard implements CanActivate {
  constructor(
    private readonly auth: Idp,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const targets = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride<boolean | undefined>(PUBLIC_KEY, targets)) return true;
    if (context.getType() !== "http") {
      throw new UnauthorizedException("nextidp's IdpGuard checks HTTP requests only.");
    }
    const http = context.switchToHttp();
    const request = http.getRequest<HttpRequest>();
    // The controller's scopes, then the route's: both are needed.
    const scopes =
      this.reflector.getAllAndMerge<string[]>(SCOPES_KEY, [
        context.getClass(),
        context.getHandler(),
      ]) ?? [];
    const authorization = request.headers?.authorization;
    try {
      const token = await this.auth.verifyBearer(
        Array.isArray(authorization) ? undefined : authorization,
        { scopes },
      );
      request.idp = { token };
      return true;
    } catch (error) {
      if (!isTokenError(error)) {
        throw new ServiceUnavailableException("The access token can't be checked now.", {
          cause: error,
        });
      }
      const response = http.getResponse<HttpResponse>();
      const challenge = bearerChallenge(error);
      // Express has setHeader, Fastify's reply has header.
      if (typeof response.setHeader === "function")
        response.setHeader("WWW-Authenticate", challenge);
      else if (typeof response.header === "function")
        response.header("WWW-Authenticate", challenge);
      throw error.code === "insufficient_scope"
        ? new ForbiddenException(error.message)
        : new UnauthorizedException(error.message);
    }
  }
}
Injectable()(IdpGuard);
Inject(IDP)(IdpGuard, undefined, 0);
Inject(Reflector)(IdpGuard, undefined, 1);

export type IdpModuleOptions = {
  /**
   * Guard every route of the app (default true): a route without a token is refused unless
   * it's @Public(). With false, guard routes yourself: @UseGuards(IdpGuard).
   */
  protectAll?: boolean;
};

export type IdpModuleAsyncOptions = IdpModuleOptions & {
  imports?: DynamicModule["imports"];
  inject?: Array<string | symbol | (abstract new (...args: never[]) => unknown)>;
  /** The settings, from your configuration: `(config: ConfigService) => ({ issuer: … })`. */
  useFactory: (...args: never[]) => IdpOptions | Promise<IdpOptions>;
};

function isIdp(value: Idp | IdpOptions): value is Idp {
  return typeof (value as Idp).verifyBearer === "function";
}

function guards(protectAll: boolean | undefined): Provider[] {
  return [IdpGuard, ...(protectAll === false ? [] : [{ provide: APP_GUARD, useClass: IdpGuard }])];
}

/**
 * The module, once, in the app's root module. Global: IdpGuard and the IDP token can be used
 * in every module.
 *
 * ```ts
 * @Module({ imports: [IdpModule.forRoot({ issuer: "https://auth.example.com", audience: "https://api.example.com" })] })
 * ```
 */
// biome-ignore lint/complexity/noStaticOnlyClass: a Nest module is a class, configured through static forRoot().
export class IdpModule {
  static forRoot(auth: Idp | IdpOptions = {}, options: IdpModuleOptions = {}): DynamicModule {
    return {
      module: IdpModule,
      global: true,
      providers: [
        { provide: IDP, useValue: isIdp(auth) ? auth : createIdp(auth) },
        ...guards(options.protectAll),
      ],
      exports: [IDP, IdpGuard],
    };
  }

  static forRootAsync(options: IdpModuleAsyncOptions): DynamicModule {
    return {
      module: IdpModule,
      global: true,
      imports: options.imports ?? [],
      providers: [
        {
          provide: IDP,
          inject: options.inject ?? [],
          useFactory: async (...args: never[]) => createIdp(await options.useFactory(...args)),
        },
        ...guards(options.protectAll),
      ],
      exports: [IDP, IdpGuard],
    };
  }
}
Module({})(IdpModule);

export type { AccessToken, TokenRequirements } from "./access-token.js";
export type { ApiConfig, IdpOptions } from "./config.js";
export { IdpError, isIdpError, isTokenError, type TokenErrorCode } from "./errors.js";
export { createIdp as idp, type Idp } from "./idp.js";
