
import { useState, useEffect, useRef } from "react";
import { io } from "socket.io-client";
import "./App.css";

const ROOM_ID = "7even-room";

const movies = [
  {
    id: 1,
    title: "Demo Cinema",
    year: 2026,
    category: "تجربة",
    description: "فيديو تجريبي للتأكد من تشغيل مشغل 7evenTv.",
    poster:
      "https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?w=600",
    video: "/demo.mp4",
  },
  {
    id: 2,
    title: "The Dark Knight",
    year: 2008,
    category: "أكشن",
    description: "أضف رابط فيديو تملكه أو لديك إذن بعرضه هنا.",
    poster:
      "https://images.unsplash.com/photo-1509347528160-9a9e33742cdb?w=600",
    video: "",
  },
  {
    id: 3,
    title: "Interstellar",
    year: 2014,
    category: "خيال علمي",
    description: "أضف رابط الفيديو الخاص بك لتفعيل التشغيل.",
    poster:
      "https://images.unsplash.com/photo-1446776811953-b23d57bd21aa?w=600",
    video: "",
  },
  {
    id: 4,
    title: "Mystery Night",
    year: 2026,
    category: "غموض",
    description: "مكان مخصص لإضافة محتوى الفيديو الخاص بك.",
    poster:
      "https://images.unsplash.com/photo-1519608487953-e999c86e7455?w=600",
    video: "",
  },
];

const categories = ["الكل", "أكشن", "خيال علمي", "غموض", "تجربة"];

export default function App() {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("الكل");
  const [selectedMovie, setSelectedMovie] = useState(null);
  const [connection, setConnection] = useState("جاري الاتصال...");
  const videoRef = useRef(null);
  const socketRef = useRef(null);
  const selectedMovieRef = useRef(selectedMovie);
  const applyingRemoteRef = useRef(false);
  const latestStateRef = useRef(null);
  const remoteApplyTimerRef = useRef(null);

  selectedMovieRef.current = selectedMovie;

  function scheduleRemoteApplyReset() {
    window.clearTimeout(remoteApplyTimerRef.current);
    remoteApplyTimerRef.current = window.setTimeout(() => {
      applyingRemoteRef.current = false;
      remoteApplyTimerRef.current = null;
    }, 500);
  }

  function applyRoomState(state) {
    latestStateRef.current = state;

    const video = videoRef.current;
    if (!video || !selectedMovieRef.current?.video) return;

    applyingRemoteRef.current = true;

    if (Math.abs(video.currentTime - state.currentTime) > 1.5) {
      try {
        video.currentTime = state.currentTime;
      } catch (error) {
        console.warn("Could not seek video to synchronized position:", error);
      }
    }

    if (state.playing && video.paused) {
      video.play().catch((error) => {
        console.info(
          "Remote playback needs user interaction in this browser:",
          error,
        );
      });
    } else if (!state.playing && !video.paused) {
      video.pause();
    }

    scheduleRemoteApplyReset();
  }

  useEffect(() => {
    const socket = io(window.location.origin, {
      path: "/sync/socket.io/",
      transports: ["polling", "websocket"],
      reconnection: true,
      timeout: 20000,
    });

    socketRef.current = socket;

    const handleConnect = () => {
      console.info("Socket.IO connected; joining sync room:", socket.id);
      setConnection("متصل");

      socket.emit("join-room", {
        roomId: ROOM_ID,
        userName: "مشاهد",
      });
    };

    const handleConnectError = (error) => {
      console.error("Socket.IO connection attempt failed:", {
        message: error.message,
        type: error.type,
        description: error.description,
        context: error.context,
      });
      setConnection(
        socket.active ? "جاري إعادة الاتصال..." : "تعذر الاتصال بسيرفر المزامنة",
      );
    };

    const handleDisconnect = (reason) => {
      console.warn("Socket.IO disconnected:", {
        reason,
        transport: socket.io.engine?.transport?.name ?? "unavailable",
      });
      setConnection("انقطع الاتصال، جارٍ إعادة المحاولة...");

      // Socket.IO does not automatically reconnect after a server namespace disconnect.
      if (reason === "io server disconnect") socket.connect();
    };

    const handleRoomState = (state) => {
      if (
        !state ||
        typeof state.playing !== "boolean" ||
        !Number.isFinite(state.currentTime) ||
        state.currentTime < 0
      ) {
        console.warn("Ignored invalid room-state payload:", state);
        return;
      }

      applyRoomState(state);
    };

    const handleReconnectAttempt = (attempt) => {
      console.info("Socket.IO reconnect attempt:", attempt);
      setConnection("جاري إعادة الاتصال...");
    };

    const handleReconnectError = (error) => {
      console.warn("Socket.IO reconnection attempt failed:", error.message);
    };

    const handleReconnectFailed = () => {
      console.error("Socket.IO exhausted its automatic reconnection attempts.");
      setConnection("تعذر الاتصال بسيرفر المزامنة");
    };

    socket.on("connect", handleConnect);
    socket.on("connect_error", handleConnectError);
    socket.on("disconnect", handleDisconnect);
    socket.on("room-state", handleRoomState);
    socket.io.on("reconnect_attempt", handleReconnectAttempt);
    socket.io.on("reconnect_error", handleReconnectError);
    socket.io.on("reconnect_failed", handleReconnectFailed);

    return () => {
      window.clearTimeout(remoteApplyTimerRef.current);
      socket.off("connect", handleConnect);
      socket.off("connect_error", handleConnectError);
      socket.off("disconnect", handleDisconnect);
      socket.off("room-state", handleRoomState);
      socket.io.off("reconnect_attempt", handleReconnectAttempt);
      socket.io.off("reconnect_error", handleReconnectError);
      socket.io.off("reconnect_failed", handleReconnectFailed);
      socket.disconnect();
      if (socketRef.current === socket) socketRef.current = null;
    };
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    const state = latestStateRef.current;

    if (!video || !selectedMovie?.video || !state) return;

    applyRoomState(state);
  }, [selectedMovie]);

  function sendPlaybackState(playing) {
    const socket = socketRef.current;
    const video = videoRef.current;

    if (!socket?.connected || !video || applyingRemoteRef.current) return;

    socket.emit("playback-update", {
      roomId: ROOM_ID,
      playing,
      currentTime: video.currentTime,
    });
  }

  function handlePlay() {
    sendPlaybackState(true);
  }

  function handlePause() {
    sendPlaybackState(false);
  }

  function handleSeek() {
    sendPlaybackState(!videoRef.current?.paused);
  }

  const filteredMovies = movies.filter((movie) => {
    const matchesSearch = movie.title
      .toLowerCase()
      .includes(search.toLowerCase());

    const matchesCategory =
      category === "الكل" || movie.category === category;

    return matchesSearch && matchesCategory;
  });

  function closePlayer() {
    setSelectedMovie(null);
  }

  return (
    <div className="app" dir="rtl">
      <header className="navbar">
        <a className="brand" href="#home">
          <span className="brand-icon">7</span>
          <span>
            even<span className="brand-accent">Tv</span>
          </span>
        </a>

        <nav className="nav-links">
          <a href="#home">الرئيسية</a>
          <a href="#movies">الأفلام</a>
          <a href="#about">عن الموقع</a>
        </nav>

        <div className="nav-status">
          <span className="status-dot" />
          {connection === "متصل" ? "Sync Online" : connection}
        </div>
      </header>

      <main id="home">
        <section className="hero">
          <div className="hero-content">
            <span className="eyebrow">
              <span className="status-dot" />
              WELCOME TO 7EVENTV
            </span>

            <h1>
              عالمك السينمائي
              <br />
              <span>في مكان واحد.</span>
            </h1>

            <p>
              اكتشف عالم الأفلام، اختار اللي بتحبه، واستمتع
              بتجربة مشاهدة بتصميم سينمائي مميز.
            </p>

            <div className="hero-actions">
              <a className="primary-btn" href="#movies">
                <span>▶</span> استكشف الأفلام
              </a>
              <span className="hero-note">YOUR CINEMA. YOUR WORLD.</span>
            </div>
          </div>

          <div className="hero-art">
            <div className="art-glow" />
            <div className="art-circle circle-one" />
            <div className="art-circle circle-two" />
            <div className="art-card">
              <span className="art-symbol">7</span>
              <span className="art-caption">YOUR NEXT MOVIE</span>
            </div>
            <div className="floating-tag">✦ CINEMA EXPERIENCE</div>
          </div>

          <div className="hero-bottom">
            <span>01 / DISCOVER</span>
            <span>SCROLL TO EXPLORE ↓</span>
          </div>
        </section>

        <section className="movies-section" id="movies">
          <div className="section-heading">
            <div>
              <span className="section-kicker">YOUR COLLECTION</span>
              <h2>اكتشف المحتوى</h2>
              <p>اختار فيلمك وافتح صفحة المشاهدة.</p>
            </div>

            <div className="movie-count">
              <strong>{filteredMovies.length}</strong>
              <span>عناصر</span>
            </div>
          </div>

          <div className="toolbar">
            <div className="search-box">
              <span>⌕</span>
              <input
                type="search"
                placeholder="دور على فيلم..."
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </div>

            <div className="categories">
              {categories.map((item) => (
                <button
                  key={item}
                  className={`category-btn ${
                    category === item ? "active" : ""
                  }`}
                  onClick={() => setCategory(item)}
                >
                  {item}
                </button>
              ))}
            </div>
          </div>

          <div className="movie-grid">
            {filteredMovies.map((movie) => (
              <article className="movie-card" key={movie.id}>
                <button
                  className="poster-button"
                  onClick={() => setSelectedMovie(movie)}
                  aria-label={`افتح ${movie.title}`}
                >
                  <img
                    className="movie-poster"
                    src={movie.poster}
                    alt={movie.title}
                    loading="lazy"
                  />
                  <span className="poster-shade" />
                  <span className="play-button">▶</span>
                  <span className="poster-category">{movie.category}</span>
                </button>

                <div className="movie-info">
                  <div>
                    <h3>{movie.title}</h3>
                    <span>
                      {movie.year} · {movie.category}
                    </span>
                  </div>
                  <button
                    className="open-movie"
                    onClick={() => setSelectedMovie(movie)}
                    aria-label={`شاهد ${movie.title}`}
                  >
                    ↗
                  </button>
                </div>
              </article>
            ))}
          </div>

          {filteredMovies.length === 0 && (
            <div className="empty-state">
              <span>⌕</span>
              <h3>ملقيناش نتائج</h3>
              <p>جرّب اسم تاني أو اختار تصنيف مختلف.</p>
            </div>
          )}
        </section>

        <section className="about-section" id="about">
          <span className="section-kicker">BUILT FOR MOVIE LOVERS</span>
          <h2>دي مجرد البداية.</h2>
          <p>
            7evenTv بيجهّز تجربة مشاهدة جماعية داخل Discord.
          </p>
        </section>
      </main>

      <footer className="footer">
        <a className="brand" href="#home">
          <span className="brand-icon">7</span>
          <span>
            even<span className="brand-accent">Tv</span>
          </span>
        </a>
        <span>© 2026 7evenTv · YOUR CINEMA EXPERIENCE</span>
      </footer>

      {selectedMovie && (
        <div
          className="modal-backdrop"
          onClick={closePlayer}
          role="presentation"
        >
          <section
            className="player-modal"
            role="dialog"
            aria-modal="true"
            aria-label={`مشاهدة ${selectedMovie.title}`}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="player-header">
              <div>
                <span className="section-kicker">NOW PLAYING · ROOM 7EVEN</span>
                <h2>{selectedMovie.title}</h2>
              </div>
              <button
                className="close-btn"
                onClick={closePlayer}
                aria-label="إغلاق المشغل"
              >
                ✕
              </button>
            </div>

            {selectedMovie.video ? (
              <video
                ref={videoRef}
                className="video-player"
                key={selectedMovie.video}
                src={selectedMovie.video}
                controls
                autoPlay
                playsInline
                onPlay={handlePlay}
                onPause={handlePause}
                onSeeked={handleSeek}
              >
                متصفحك لا يدعم تشغيل الفيديو.
              </video>
            ) : (
              <div className="video-placeholder">
                <span className="placeholder-play">▶</span>
                <h3>الفيديو لسه مش مضاف</h3>
                <p>
                  ضيف رابط فيديو تملكه في بيانات الفيلم داخل App.jsx.
                </p>
              </div>
            )}

            <p className="player-description">
              {selectedMovie.description}
            </p>

            <p style={{ color: "#b7a5ff", textAlign: "center" }}>
              {connection === "متصل"
                ? "🟢 متصل بسيرفر المزامنة — افتح نفس الغرفة مع أصحابك"
                : `🟠 ${connection}`}
            </p>
          </section>
        </div>
      )}
    </div>
  );
}
