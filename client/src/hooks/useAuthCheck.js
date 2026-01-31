import { useEffect, useState } from "react";
import http from "../api/http";

export default function useAuthCheck() {
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    const run = async () => {
      const token = localStorage.getItem("token");
      const user = localStorage.getItem("user");
      if (!token || !user) {
        setChecking(false);
        return;
      }

      try {
        // Your backend already has this
        const res = await http.get("/api/private/me");
        // optional: refresh user data from server
        if (res.data?.user) {
          localStorage.setItem("user", JSON.stringify(res.data.user));
        }
      } catch (e) {
        // interceptor will logout on 401
      } finally {
        setChecking(false);
      }
    };

    run();
  }, []);

  return checking;
}
