import Image from "next/image";
import styles from "./page.module.css";
import Greet from "./components/greet";
import CurLocation from "./components/location";
import Destination from "./components/destination";
import Map from "./components/map";
import Directions from "./components/directions";

export default function Home() {
  return (
    <div className={styles.page}>
      <main className={styles.main}>
        <div className={styles.intro}>
          <Greet name="Meuro" />
          <CurLocation />
          <Destination />
          <Map />
          <hr />
          <Directions />
        </div>
      </main>
    </div>
  );
}
