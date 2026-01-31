export default function Spinner({ text = "Loading..." }) {
  return (
    <div className="spinnerWrap">
      <div className="spinner" />
      <div className="muted" style={{ marginTop: 10 }}>{text}</div>
    </div>
  );
}
