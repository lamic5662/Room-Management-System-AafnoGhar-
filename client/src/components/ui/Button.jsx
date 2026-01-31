export default function Button({ children, className = "", ...props }) {
  return (
    <button
      className={
        "px-4 py-2 rounded-lg bg-gray-900 text-white hover:bg-black active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed " +
        className
      }
      {...props}
    >
      {children}
    </button>
  );
}
