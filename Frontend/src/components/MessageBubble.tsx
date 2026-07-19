type MessageBubbleProps = {
  message: {
    senderId: string;
    text: string;
  };
  currentUser: string;
};

export default function MessageBubble({
  message,
  currentUser,
}: MessageBubbleProps) {
  const mine = message.senderId === currentUser;

  return (
    <div className={mine ? "text-right mb-2" : "text-left mb-2"}>
      <div
        className={
          mine
            ? "inline-block rounded-xl bg-blue-600 px-4 py-2 text-white"
            : "inline-block rounded-xl bg-gray-200 px-4 py-2 text-black"
        }
      >
        {message.text}
      </div>
    </div>
  );
}