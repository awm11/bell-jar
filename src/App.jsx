import { BrandLogo, SoundIcon, SupportLinks } from "./Branding.jsx";
import { useEffect, useState } from "react";
import SoundWaves, { SoundWavesPreview } from "./sound_waves.jsx";
import BellJar, { BellJarPreview } from "./bell_jar.jsx";

/* ------------------------------------------------------------------
   Deep links: each lesson has its own URL fragment, e.g. #bell-jar
   (a leading slash, #/bell-jar, is accepted too).
   ------------------------------------------------------------------ */

const LESSONS = [
  {
    id: "waves",
    slug: "sound-waves",
    number: "01",
    tag: "SOUND WAVES",
    title: "What Is a Sound Wave?",
    text: "See how a vibrating loudspeaker or tuning fork passes its vibration through the air. Change the frequency and amplitude, and hear the difference.",
    Component: SoundWaves,
    Preview: SoundWavesPreview,
    pageTitle: "Sound Waves • Sound",
  },
  {
    id: "belljar",
    slug: "bell-jar",
    number: "02",
    tag: "SOUND NEEDS A MEDIUM",
    title: "The Bell Jar Experiment",
    text: "Pump the air out of a bell jar with a buzzer inside. Watch the particles that carry the sound disappear, and the room go quiet.",
    Component: BellJar,
    Preview: BellJarPreview,
    pageTitle: "Bell Jar • Sound",
  },
];

function lessonFromHash() {
  if (typeof window === "undefined") return null;
  const slug = window.location.hash
    .replace(/^#\/?/, "")
    .replace(/\/$/, "")
    .toLowerCase();
  return LESSONS.find((l) => l.slug === slug) || null;
}

export default function App() {
  const [lesson, setLesson] = useState(lessonFromHash);

  useEffect(() => {
    const sync = () => setLesson(lessonFromHash());
    window.addEventListener("hashchange", sync);
    window.addEventListener("popstate", sync);
    return () => {
      window.removeEventListener("hashchange", sync);
      window.removeEventListener("popstate", sync);
    };
  }, []);

  useEffect(() => {
    document.title = lesson ? lesson.pageTitle : "Sound";
  }, [lesson]);

  const open = (l) => {
    window.location.hash = l.slug;
    setLesson(l);
    window.scrollTo({ top: 0 });
  };

  const goHome = () => {
    if (window.history && window.history.pushState) {
      window.history.pushState(null, "", window.location.pathname + window.location.search);
    } else {
      window.location.hash = "";
    }
    setLesson(null);
    window.scrollTo({ top: 0 });
  };

  if (lesson) {
    const { Component } = lesson;
    return <Component key={lesson.id} onBack={goHome} />;
  }

  return (
    <div className="app">
      <style>{`
        * {
          box-sizing: border-box;
        }

        html,
        body,
        #root {
          margin: 0;
          background: #f7f8fa;
        }

        body {
          color: #172033;
          font-family:
            Inter,
            ui-sans-serif,
            system-ui,
            -apple-system,
            BlinkMacSystemFont,
            "Segoe UI",
            sans-serif;
        }

        button {
          font: inherit;
        }

        .app {
          min-height: 100vh;
          background: #f7f8fa;
        }

        .simpleHeader {
          background: #ffffff;
          border-bottom: 1px solid #e4e7eb;
          padding: 22px 32px 20px;
        }

        .simpleHeaderInner {
          width: min(1380px, 100%);
          margin: 0 auto;
        }

        .simpleEyebrow {
          margin-bottom: 6px;
          color: #667085;
          font-size: 11px;
          font-weight: 800;
          letter-spacing: 0.12em;
        }

        .titleRow {
          display: flex;
          align-items: center;
          gap: 14px;
        }

        .simpleHeader h1 {
          margin: 0;
          color: #172033;
          font-size: 34px;
          line-height: 1.1;
          font-weight: 750;
          letter-spacing: -0.025em;
        }

        .simpleHeader p {
          margin: 8px 0 0;
          color: #667085;
          font-size: 14px;
          line-height: 1.5;
        }

        .content {
          width: min(1380px, calc(100% - 40px));
          margin: 0 auto;
          padding: 34px 0 60px;
        }

        .sectionHeading {
          display: flex;
          align-items: baseline;
          justify-content: space-between;
          gap: 30px;
          margin-bottom: 20px;
        }

        .sectionHeading h2 {
          margin: 0;
          color: #172033;
          font-size: 22px;
          line-height: 1.2;
          font-weight: 700;
        }

        .sectionHeading p {
          margin: 0;
          color: #667085;
          font-size: 14px;
        }

        .cards {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 18px;
        }

        .lessonCard {
          position: relative;
          display: flex;
          flex-direction: column;
          min-width: 0;
          padding: 18px;
          border: 1px solid #dfe3e8;
          border-radius: 14px;
          background: #ffffff;
          color: #172033;
          text-align: left;
          cursor: pointer;
          overflow: hidden;
          box-shadow: 0 2px 6px rgba(15, 23, 42, 0.04);
          transition:
            transform 0.2s ease,
            border-color 0.2s ease,
            box-shadow 0.2s ease;
        }

        .lessonCard:hover {
          transform: scale(1.015);
          border-color: #c8ced7;
          box-shadow: 0 10px 24px rgba(15, 23, 42, 0.10);
        }

        .lessonCard:focus-visible {
          outline: 3px solid rgba(37, 99, 235, 0.22);
          outline-offset: 3px;
        }

        .cardTop {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 8px;
        }

        .number {
          color: #98a2b3;
          font-size: 12px;
          font-weight: 700;
          letter-spacing: 0.08em;
        }

        .cardArrow {
          color: #667085;
          font-size: 19px;
          line-height: 1;
        }

        .cardIllustration {
          position: relative;
          aspect-ratio: 1150 / 540;
          max-width: 100%;
          margin: 0 -4px 12px;
          border-radius: 10px;
          overflow: hidden;
          background: #ffffff;
          pointer-events: none;
        }

        .cardTag {
          margin-bottom: 6px;
          color: #667085;
          font-size: 10px;
          font-weight: 800;
          letter-spacing: 0.12em;
        }

        .lessonCard h3 {
          margin: 0;
          color: #172033;
          font-size: 20px;
          line-height: 1.2;
          font-weight: 700;
          letter-spacing: -0.015em;
        }

        .lessonCard p {
          margin: 8px 0 12px;
          color: #667085;
          font-size: 13px;
          line-height: 1.55;
        }

        .openLesson {
          color: #344054;
          font-size: 13px;
          font-weight: 700;
        }

        @media (max-width: 760px) {
          .simpleHeader {
            padding: 18px 16px;
          }

          .content {
            width: calc(100% - 32px);
          }

          .cards {
            grid-template-columns: 1fr;
          }

          .sectionHeading {
            flex-direction: column;
            gap: 4px;
          }
        }
      `}</style>

      <header className="simpleHeader">
        <div className="simpleHeaderInner has-brand">
          <div className="titleRow">
            <SoundIcon className="home-icon" />
            <h1>Sound</h1>
          </div>
          <BrandLogo />
        </div>
      </header>

      <main className="content">
        <div className="sectionHeading">
          <h2>Lessons</h2>
          <p>Choose a simulation to open it.</p>
        </div>

        <div className="cards">
          {LESSONS.map((l) => {
            const { Preview } = l;
            return (
              <div
                key={l.id}
                className="lessonCard"
                role="link"
                tabIndex={0}
                onClick={() => open(l)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    open(l);
                  }
                }}
              >
                <div className="cardTop">
                  <span className="number">{l.number}</span>
                  <span className="cardArrow">→</span>
                </div>
                <div className="cardIllustration" aria-hidden="true">
                  <Preview />
                </div>
                <div className="cardTag">{l.tag}</div>
                <h3>{l.title}</h3>
                <p>{l.text}</p>
                <span className="openLesson">Open lesson →</span>
              </div>
            );
          })}
        </div>
        <SupportLinks className="landing-support" />
      </main>
    </div>
  );
}
