import crypto from "crypto";
import Logger from "../lib/Logger.js";
import { getMilliseconds } from "./constants.js";

export const generateUUID = () => {
  return crypto.randomBytes(16).toString("hex");
};

const getCookiesOptions = (rememberMe, cookieName) => {
  const isProduction = process.env.NODE_ENV === "production";
  const cookieDefaults = {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? "none" : "lax",
    path: "/",
  };
  switch (cookieName) {
    case "access_token":
      return {
        ...cookieDefaults,
        maxAge: getMilliseconds(0, 0, 30, 0), // 30 minutes
      };
    case "refresh_token":
      return {
        ...cookieDefaults,
        maxAge: rememberMe
          ? getMilliseconds(30, 0, 0, 0) // 30 days
          : getMilliseconds(0, 24, 0, 0), // 24 hours
      };
    case "id_token":
      return {
        ...cookieDefaults,
        maxAge: rememberMe
          ? getMilliseconds(30, 0, 0, 0) // 30 days
          : getMilliseconds(0, 24, 0, 0), // 24 hours
      };
    default:
      Logger.warn(`Unknown cookie name: ${cookieName}`);
      return {
        ...cookieDefaults,
        maxAge: rememberMe
          ? getMilliseconds(30, 0, 0, 0) // 30 days
          : getMilliseconds(0, 24, 0, 0), // 24 hours
      };
  }
};
export const setCookies = (res, cookies, rememberMe = false) => {
  if (cookies && typeof cookies === "object") {
    const isProduction = process.env.NODE_ENV === "production";
    console.log(
      `Setting cookies in ${isProduction ? "production" : "development"} mode`
    );

    Object.entries(cookies).forEach(([key, value]) => {
      if (!value) {
        Logger.warn(`Attempted to set cookie '${key}' with empty value`);
        return;
      }

      const cookieOptions = getCookiesOptions(rememberMe, key);

      Logger.debug(
        `Setting cookie: ${key} (expiry: ${cookieOptions.maxAge ? cookieOptions.maxAge / 1000 + "s" : "session"})`
      );

      console.log(
        " Object.entries key, value, cookieOptions",
        key,
        value,
        cookieOptions
      );

      res.cookie(key, value, cookieOptions);
    });
  } else {
    Logger.warn("Invalid cookies object provided to setCookies");
  }
};
