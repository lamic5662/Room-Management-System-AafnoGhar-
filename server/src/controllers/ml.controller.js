import { execFile } from "child_process";
import path from "path";

const predictPrice = async (req, res) => {
  try {
    const payload = req.body;
    const scriptPath = path.join(process.cwd(), "ml", "predict.py");

    execFile("python3", [scriptPath, JSON.stringify(payload)], (err, stdout, stderr) => {
      if (err) {
        console.error("ML error:", stderr || err.message);
        return res.status(500).json({ message: "ML prediction failed" });
      }
      try {
        const data = JSON.parse(String(stdout).trim());
        return res.json(data);
      } catch (e) {
        console.error("Bad ML output:", stdout);
        return res.status(500).json({ message: "Invalid ML output" });
      }
    });
  } catch (err) {
    console.error("ML controller error:", err.message);
    return res.status(500).json({ message: "Server error" });
  }
};

export { predictPrice };
