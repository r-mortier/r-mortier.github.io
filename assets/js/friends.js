const friends = [
  { name: "emir", note: "the one and only", color: "#ffd93d", image: "assets/img/black.png", pinned: true },
];

function friendCard(friend) {
  const card = document.createElement("article");
  card.className = "friend-card";
  card.innerHTML = `<img src="${friend.image}" alt="${friend.name}" loading="lazy"><div><strong style="color:${friend.color}">${friend.name}</strong><span>${friend.note}</span></div>`;
  card.dataset.fallbackColor = friend.color;
  const image = card.querySelector("img");
  const applyFriendColor = () => {
    const color = window.extractImageColor?.(image) || friend.color;
    card.style.setProperty("--friend-color", color);
    card.style.setProperty("--friend-wash", `color-mix(in srgb, ${color} 14%, transparent)`);
    card.style.setProperty("--friend-shadow", `color-mix(in srgb, ${color} 28%, transparent)`);
    card.querySelector("strong").style.color = color;
    const pinnedSurface = card.closest(".pinned-friend");
    if (pinnedSurface) pinnedSurface.style.setProperty("--friend-color", color);
  };
  image.addEventListener("load", applyFriendColor, { once: true });
  if (image.complete) applyFriendColor();
  card.refreshFriendColor = applyFriendColor;
  return card;
}

document.addEventListener("DOMContentLoaded", () => {
  const pinned = document.getElementById("pinned-friend");
  const track = document.getElementById("friends-track");
  const pinnedFriend = friends.find((friend) => friend.pinned);
  const movingFriends = friends.filter((friend) => !friend.pinned);
  if (pinned && pinnedFriend) {
    const pinnedCard = friendCard(pinnedFriend);
    pinned.append(pinnedCard);
    pinnedCard.refreshFriendColor();
    pinned.insertAdjacentHTML("beforeend", '<span class="pin-label"><i class="fa-solid fa-thumbtack"></i> pinned</span>');
  }
  if (track) {
    [...movingFriends, ...movingFriends].forEach((friend) => track.append(friendCard(friend)));
    track.addEventListener("mouseenter", () => track.classList.add("is-paused"));
    track.addEventListener("mouseleave", () => track.classList.remove("is-paused"));
  }
});
