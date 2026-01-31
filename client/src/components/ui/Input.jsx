export default function Input({ className = "", ...props }) {
  return (
    <input
      className={
        "px-3 py-2 border rounded-lg w-full focus:outline-none focus:ring-2 focus:ring-gray-900/20 " +
        className
      }
      {...props}
    />
  );
}
