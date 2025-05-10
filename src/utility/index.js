import crypto from "crypto";
import Logger from "../lib/Logger.js";
import { TOKEN_VALIDITY_IN_MILLISECONDS } from "./constants.js";

export const generateUUID = () => {
  return crypto.randomBytes(16).toString("hex");
};

export const setCookies = (res, cookies, rememberMe = false) => {
  if (cookies && typeof cookies === "object") {
    const isProduction = process.env.NODE_ENV === "production";
    console.log(
      `Setting cookies in ${isProduction ? "production" : "development"} mode`
    );

    const cookieDefaults = {
      httpOnly: true,
      secure: isProduction,
      path: "/",
    };

    Object.entries(cookies).forEach(([key, value]) => {
      if (!value) {
        Logger.warn(`Attempted to set cookie '${key}' with empty value`);
        return;
      }

      let cookieOptions = { ...cookieDefaults };

      if (key === "access_token") {
        cookieOptions.maxAge = TOKEN_VALIDITY_IN_MILLISECONDS["30_MINUTES"];
      } else if (key === "refresh_token") {
        cookieOptions.maxAge = rememberMe
          ? TOKEN_VALIDITY_IN_MILLISECONDS["30_DAYS"]
          : TOKEN_VALIDITY_IN_MILLISECONDS["24_HOURS"];
      }

      Logger.debug(
        `Setting cookie: ${key} (expiry: ${cookieOptions.maxAge ? cookieOptions.maxAge / 1000 + "s" : "session"})`
      );
      res.cookie(key, value, cookieOptions);
    });
  } else {
    Logger.warn("Invalid cookies object provided to setCookies");
  }
};
