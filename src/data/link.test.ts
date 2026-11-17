import { describe, expect, it } from "vitest";
import { parseAuthHash } from "./link";

describe("link z e-maila", () => {
  it("odczytuje sesję z zaproszenia", () => {
    const r = parseAuthHash("#access_token=aaa&expires_in=3600&refresh_token=rrr&token_type=bearer&type=invite");
    expect(r).toEqual({ session: { access_token: "aaa", refresh_token: "rrr", type: "invite" }, error: null });
  });

  it("odczytuje błąd wygasłego linku", () => {
    const r = parseAuthHash("#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired");
    expect(r.session).toBeNull();
    expect(r.error).toBe("Email link is invalid or has expired");
  });

  it("zwykłe adresy aplikacji nie są linkami logowania", () => {
    expect(parseAuthHash("#/grafik")).toEqual({ session: null, error: null });
    expect(parseAuthHash("")).toEqual({ session: null, error: null });
  });
});
