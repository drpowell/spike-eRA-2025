// Firebase SDK Imports
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import {
    getAuth,
    GoogleAuthProvider,
    signInWithPopup,
    onAuthStateChanged,
    signOut,
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import {
    getFirestore,
    doc,
    setDoc,
    onSnapshot,
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// --- 1. FIREBASE CONFIG & INITIALIZATION ---

// IMPORTANT: Replace with your Firebase project's configuration
const firebaseConfig = {
    apiKey: "AIzaSyD_HhVzoRqw7dPcy5VULFou9OnOQxbfzs8",
    authDomain: "era-2025.firebaseapp.com",
    projectId: "era-2025",
    storageBucket: "era-2025.firebasestorage.app",
    messagingSenderId: "378716267717",
    appId: "1:378716267717:web:d1902c4e9b475d98a23cac",
    measurementId: "G-LWK2XKQ8ZH",
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const appId = firebaseConfig.projectId || "conference-app";

// --- 2. STATE MANAGEMENT ---

let currentUser = null;
let userHighlights = new Set();
let unsubscribeFromHighlights = null;

// --- 3. DOM ELEMENTS ---

const loginBtn = document.getElementById("login-btn");
const logoutBtn = document.getElementById("logout-btn");
const userInfoEl = document.getElementById("user-info");
const userEmailEl = document.getElementById("user-email");
const root = document.getElementById("root");
const highlightToggle = document.getElementById("highlight-toggle");

// --- 4. AUTHENTICATION ---

onAuthStateChanged(auth, (user) => {
    if (user) {
        // User is signed in
        currentUser = user;
        loginBtn.classList.add("hidden");
        userInfoEl.classList.remove("hidden");
        userEmailEl.textContent = user.displayName || user.email;
        listenForHighlights(user.uid);
        document.body.classList.add("logged-in");
    } else {
        // User is signed out
        currentUser = null;
        loginBtn.classList.remove("hidden");
        userInfoEl.classList.add("hidden");
        userEmailEl.textContent = "";
        if (unsubscribeFromHighlights) {
            unsubscribeFromHighlights();
        }
        userHighlights.clear();
        updateVisibleHighlights();
        document.body.classList.remove("logged-in");
    }
});

loginBtn.addEventListener("click", async () => {
    const provider = new GoogleAuthProvider();
    try {
        await signInWithPopup(auth, provider);
    } catch (error) {
        console.error("Sign-in error", error);
    }
});

logoutBtn.addEventListener("click", async () => {
    try {
        await signOut(auth);
    } catch (error) {
        console.error("Sign-out error", error);
    }
});

// --- 5. FIRESTORE & HIGHLIGHT LOGIC ---

function listenForHighlights(uid) {
    const docPath = `/artifacts/${appId}/users/${uid}/highlights/sessions`;
    const highlightsDocRef = doc(db, docPath);

    unsubscribeFromHighlights = onSnapshot(highlightsDocRef, (docSnap) => {
        userHighlights.clear();
        if (docSnap.exists() && docSnap.data().sessionIds) {
            docSnap.data().sessionIds.forEach((id) => userHighlights.add(id));
        }
        updateVisibleHighlights();
    });
}

async function handleCellClick(event) {
    if (!currentUser) return;

    const cell = event.currentTarget;
    const cellId = cell.dataset.cellId;
    if (!cellId) return;

    if (userHighlights.has(cellId)) {
        userHighlights.delete(cellId);
    } else {
        userHighlights.add(cellId);
    }

    // Update UI immediately for responsiveness
    cell.classList.toggle("highlighted");

    // Save to Firestore
    const docPath = `/artifacts/${appId}/users/${currentUser.uid}/highlights/sessions`;
    const highlightsDocRef = doc(db, docPath);
    await setDoc(highlightsDocRef, {
        sessionIds: Array.from(userHighlights),
    });
}

function toggleHighlightedSessions(showOnlyHighlighted) {
    const rows = document.querySelectorAll(".streams-table tbody tr");
    rows.forEach((row) => {
        if (showOnlyHighlighted) {
            const hasHighlight = row.querySelector(".highlighted");
            if (!hasHighlight) {
                row.classList.add("hidden-row");
            } else {
                row.classList.remove("hidden-row");
            }
        } else {
            row.classList.remove("hidden-row");
        }
    });
}

function updateVisibleHighlights() {
    const allCells = document.querySelectorAll("[data-cell-id]");
    allCells.forEach((cell) => {
        const cellId = cell.dataset.cellId;
        if (userHighlights.has(cellId)) {
            cell.classList.add("highlighted");
        } else {
            cell.classList.remove("highlighted");
        }
    });

    // Maintain filter state if toggle is checked
    if (highlightToggle.checked) {
        toggleHighlightedSessions(true);
    }
}

// --- 6. RENDER CONFERENCE PROGRAM ---

async function renderProgram() {
    try {
        const res = await fetch("./conference_program.json");
        if (!res.ok) throw new Error(res.statusText);
        const data = await res.json();

        root.innerHTML = ""; // Clear "Loading..." message

        // Create days navigation
        const daysNav = document.createElement("div");
        daysNav.className = "days-nav";
        root.appendChild(daysNav);

        const byDay = {};
        for (const item of data) {
            const day = item.day || "Unknown";
            const time = (item.time || "").trim() || "TBA";
            const loc =
                (item.location || "N/A").trim() === "N/A"
                    ? "General"
                    : item.location.trim();
            if (!byDay[day]) byDay[day] = [];
            byDay[day].push({ ...item, time, location: loc });
        }

        const sortWeekdays = (arr) => {
            const order = [
                "Monday",
                "Tuesday",
                "Wednesday",
                "Thursday",
                "Friday",
                "Saturday",
                "Sunday",
            ];
            return arr.sort((a, b) => order.indexOf(a) - order.indexOf(b));
        };

        const days = sortWeekdays(Object.keys(byDay));

        // Add day buttons to navigation
        days.forEach((day) => {
            const btn = document.createElement("button");
            btn.textContent = day;
            btn.addEventListener("click", () => {
                const daySection = document.querySelector(
                    `section[data-day="${day}"]`
                );
                if (daySection) {
                    daySection.scrollIntoView({ behavior: "smooth" });
                }
            });
            daysNav.appendChild(btn);
        });

        for (const day of days) {
            // ... [rest of the table rendering logic remains the same]
            const sessions = byDay[day];
            const locSet = new Set(sessions.map((s) => s.location));
            const locations = Array.from(locSet)
                .filter((loc) => loc !== "General") // Remove General from columns
                .sort((a, b) => {
                    const order = (loc) => {
                        if (/auditorium/i.test(loc)) return 0;
                        if (/\bB1\b/i.test(loc)) return 1;
                        if (/\bB2\b/i.test(loc)) return 2;
                        if (/\bB3\b/i.test(loc)) return 3;
                        if (/\bRoom\b/i.test(loc)) return 4;
                        if (/Plaza/i.test(loc)) return 5;
                        return 6;
                    };
                    return order(a) - order(b) || a.localeCompare(b);
                });

            const byTime = {};
            for (const s of sessions) {
                if (!byTime[s.time]) byTime[s.time] = [];
                byTime[s.time].push(s);
            }

            const parseMins = (t) => {
                const m = t.match(/(\d{1,2}):(\d{2})/);
                return m
                    ? parseInt(m[1], 10) * 60 + parseInt(m[2], 10)
                    : 24 * 60;
            };
            const times = Object.keys(byTime).sort(
                (a, b) => parseMins(a) - parseMins(b) || a.localeCompare(b)
            );

            const dayEl = document.createElement("section");
            dayEl.className = "day";
            dayEl.dataset.day = day; // Add this line to help with scroll tracking
            dayEl.innerHTML = `<div class="day-header"><div class="date">${day}</div><div class="legend">Streams: ${locations.join(
                " · "
            )}</div></div>`;

            const table = document.createElement("table");
            table.className = "streams-table";
            table.innerHTML = `<thead><tr><th class="time-col">Time</th>${locations
                .map((l) => `<th>${l}</th>`)
                .join("")}</tr></thead>`;

            const tbody = document.createElement("tbody");
            for (const time of times) {
                const row = document.createElement("tr");
                const generalItems = byTime[time].filter(
                    (s) => s.location === "General"
                );

                if (generalItems.length > 0) {
                    // Create a spanning cell for General sessions
                    const cell = document.createElement("td");
                    cell.colSpan = locations.length + 1; // +1 for time column
                    cell.classList.add("clickable");
                    const cellId = `${day}-${time}-general`
                        .replace(/[\s:/]/g, "-")
                        .toLowerCase();
                    cell.dataset.cellId = cellId;
                    cell.addEventListener("click", handleCellClick);

                    cell.innerHTML = generalItems
                        .map((it) => {
                            const aStart =
                                it.url && it.url !== "N/A"
                                    ? `<a href="${it.url}" target="_blank" rel="noopener">`
                                    : "";
                            const aEnd = aStart ? "</a>" : "";
                            const authors =
                                it.authors && it.authors !== "N/A"
                                    ? `<div class="meta">${escapeHtml(
                                          it.authors
                                      )}</div>`
                                    : "";
                            const details =
                                it.details && it.details !== "N/A"
                                    ? `<div class="meta">${escapeHtml(
                                          it.details
                                      ).slice(0, 300)}${
                                          it.details.length > 300 ? "…" : ""
                                      }</div>`
                                    : "";
                            return `<div class="session" data-location="General">${aStart}<div class="title">${escapeHtml(
                                it.title
                            )}</div>${aEnd}${authors}${details}</div>`;
                        })
                        .join("");

                    row.appendChild(cell);
                } else {
                    // Regular row with time and location cells
                    row.innerHTML = `<td class="time-col">${time}</td>`;

                    for (const loc of locations) {
                        const cell = document.createElement("td");
                        cell.dataset.label = loc; // Add data-label for mobile view
                        const items = byTime[time].filter(
                            (s) => s.location === loc
                        );

                        if (items.length === 0) {
                            // Do NOT make empty cells selectable/clickable
                            cell.innerHTML = `<div class="empty">&nbsp;</div>`;
                        } else {
                            // Only non-empty cells get an id, clickable class and listener
                            const cellId = `${day}-${time}-${loc}`
                                .replace(/[\s:/]/g, "-")
                                .toLowerCase();
                            cell.dataset.cellId = cellId;
                            cell.classList.add("clickable");
                            cell.addEventListener("click", handleCellClick);

                            cell.innerHTML = items
                                .map((it) => {
                                    const aStart =
                                        it.url && it.url !== "N/A"
                                            ? `<a href="${it.url}" target="_blank" rel="noopener">`
                                            : "";
                                    const aEnd = aStart ? "</a>" : "";
                                    const authors =
                                        it.authors && it.authors !== "N/A"
                                            ? `<div class="meta">${escapeHtml(
                                                  it.authors
                                              )}</div>`
                                            : "";
                                    const details =
                                        it.details && it.details !== "N/A"
                                            ? `<div class="meta">${escapeHtml(
                                                  it.details
                                              ).slice(0, 300)}${
                                                  it.details.length > 300
                                                      ? "…"
                                                      : ""
                                              }</div>`
                                            : "";
                                    return `<div class="session" data-location="${escapeHtml(
                                        loc
                                    )}">${aStart}<div class="title">${escapeHtml(
                                        it.title
                                    )}</div>${aEnd}${authors}${details}</div>`;
                                })
                                .join("");
                        }
                        row.appendChild(cell);
                    }
                }
                tbody.appendChild(row);
            }
            table.appendChild(tbody);
            dayEl.appendChild(table);
            root.appendChild(dayEl);
        }

        // Add scroll tracking
        const observerOptions = {
            root: null,
            rootMargin: "-50% 0px",
            threshold: 0,
        };

        const observer = new IntersectionObserver((entries) => {
            entries.forEach((entry) => {
                if (entry.isIntersecting) {
                    const day = entry.target.dataset.day;
                    const buttons = daysNav.querySelectorAll("button");
                    buttons.forEach((btn) => {
                        if (btn.textContent === day) {
                            btn.classList.add("active");
                        } else {
                            btn.classList.remove("active");
                        }
                    });
                }
            });
        }, observerOptions);

        // Observe all day sections
        document.querySelectorAll("section.day").forEach((section) => {
            observer.observe(section);
        });

        updateVisibleHighlights(); // Apply highlights after table is built
    } catch (e) {
        root.innerHTML = `<p style="color:#900">Failed to load conference program. (${e.message})</p>`;
    }
}

function escapeHtml(str) {
    if (!str) return "";
    return String(str).replace(
        /[&<>"']/g,
        (s) =>
            ({
                "&": "&amp;",
                "<": "&lt;",
                ">": "&gt;",
                '"': "&quot;",
                "'": "&#39;",
            }[s])
    );
}

highlightToggle.addEventListener("change", (e) => {
    toggleHighlightedSessions(e.target.checked);
});

renderProgram();
