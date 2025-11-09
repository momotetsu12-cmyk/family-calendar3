"use client";

import React, { useEffect, useState } from 'react';
console.log("API_KEY:", process.env.NEXT_PUBLIC_FIREBASE_API_KEY);

import {
  initializeApp,
  FirebaseApp,
} from 'firebase/app';
import {
  getFirestore,
  Firestore,
  collection,
  doc,
  setDoc,
  deleteDoc,
  onSnapshot,
} from 'firebase/firestore';
import {
  getAuth,
  Auth,
  User,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
} from 'firebase/auth';

// --- Firebase設定 ---
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

let db: Firestore | null = null;
let auth: Auth | null = null;

try {
  const app: FirebaseApp = initializeApp(firebaseConfig);
  db = getFirestore(app);
  auth = getAuth(app);
} catch (e) {
  console.error('Firebase initialization error:', e);
}

// --- 定数 ---
const family = [
  { name: 'ゆずる', color: '#64B5F6' },
  { name: 'ようこ', color: '#FFD54F' },
  { name: 'ちなつ', color: '#F48FB1' },
  { name: 'りょうや', color: '#81C784' },
];

const destinations = ['米沢', '諏訪', '富山', '松本', '未定'];

// --- コンポーネント ---
export default function Home() {
  const [user, setUser] = useState<User | null>(null);
  const [authModalVisible, setAuthModalVisible] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [authMode, setAuthMode] = useState<'signin' | 'signup'>('signin');

  const today = new Date();
  const [currentYear, setCurrentYear] = useState(today.getFullYear());
  const [currentMonth, setCurrentMonth] = useState(today.getMonth());
  const [plans, setPlans] = useState<Record<string, Array<{ name: string; destination: string; color: string }>>>({});
  const [selectedDateKey, setSelectedDateKey] = useState<string | null>(null);
  const [selectedPerson, setSelectedPerson] = useState<string | null>(null);
  const [modalVisible, setModalVisible] = useState(false);

  // --- 認証状態の監視 ---
  useEffect(() => {
    if (!auth) return;
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setAuthModalVisible(!u);
    });
    return unsubscribe;
  }, []);

  // --- Firestoreから予定取得 ---
  useEffect(() => {
    if (!db) return;
    const col = collection(db, 'plans');
    const unsubscribe = onSnapshot(
      col,
      (snapshot) => {
        const newPlans: Record<string, Array<{ name: string; destination: string; color: string }>> = {};
        snapshot.forEach((docSnap) => {
          const id = docSnap.id;
          const data = docSnap.data();
          newPlans[id] = Array.isArray(data.items) ? data.items : [];
        });
        setPlans(newPlans);
      },
      (error) => {
        console.error('Firestore onSnapshot error:', error);
      }
    );
    return () => unsubscribe();
  }, [user]);

  // --- ユニークキー ---
  const makeKey = (year: number, month0: number, day: number) =>
    `${year}-${month0}-${day}`;

  // --- 認証処理 ---
  const handleSignUp = () => {
    if (!email || !password) {
      alert('メールアドレスとパスワードを入力してください');
      return;
    }
    if (!auth) return;
    createUserWithEmailAndPassword(auth, email, password)
      .then(() => alert('ユーザー登録が完了しました'))
      .catch((error) => alert('登録エラー: ' + error.message));
  };

  const handleSignIn = () => {
    if (!email || !password) {
      alert('メールアドレスとパスワードを入力してください');
      return;
    }
    if (!auth) return;
    signInWithEmailAndPassword(auth, email, password)
      .then(() => alert('ログインしました'))
      .catch((error) => alert('ログインエラー: ' + error.message));
  };

  const handleSignOut = () => {
    if (!auth) return;
    signOut(auth).catch((error) => alert('ログアウトエラー: ' + error.message));
  };

  // --- 日付クリック ---
  const handleDayClick = (day: number) => {
    if (!user) {
      alert('ログインしてください');
      return;
    }
    if (!selectedPerson) {
      alert('予定を入力する家族を選んでください');
      return;
    }
    const key = makeKey(currentYear, currentMonth, day);
    setSelectedDateKey(key);
    setModalVisible(true);
  };

  // --- 行先選択（選択した瞬間に保存） ---
  const handleSelectDestination = async (destination: string) => {
    if (!selectedPerson || !selectedDateKey || !db) return;
    const currentItems = plans[selectedDateKey] ? [...plans[selectedDateKey]] : [];
    const existingIndex = currentItems.findIndex((p) => p.name === selectedPerson);
    const personColor = family.find((f) => f.name === selectedPerson)?.color || '#000000';
    const newEntry = { name: selectedPerson, destination, color: personColor };

    if (existingIndex >= 0) {
      currentItems[existingIndex] = newEntry;
    } else {
      currentItems.push(newEntry);
    }

    try {
      await setDoc(doc(db, 'plans', selectedDateKey), { items: currentItems });
      setModalVisible(false);
    } catch (e) {
      console.error('保存エラー:', e);
      alert('予定の保存に失敗しました');
    }
  };

  // --- 予定削除 ---
  const handleDeletePlan = async () => {
    if (!selectedPerson || !selectedDateKey || !db) return;
    const currentItems = plans[selectedDateKey] ? [...plans[selectedDateKey]] : [];
    const newItems = currentItems.filter((p) => p.name !== selectedPerson);

    try {
      if (newItems.length === 0) {
        await deleteDoc(doc(db, 'plans', selectedDateKey));
      } else {
        await setDoc(doc(db, 'plans', selectedDateKey), { items: newItems });
      }
      setModalVisible(false);
    } catch (e) {
      console.error('削除エラー:', e);
    }
  };

  // --- 月切り替え ---
  const changeMonth = (offset: number) => {
    let ny = currentYear;
    let nm = currentMonth + offset;
    if (nm < 0) {
      nm = 11;
      ny -= 1;
    } else if (nm > 11) {
      nm = 0;
      ny += 1;
    }
    setCurrentMonth(nm);
    setCurrentYear(ny);
  };

  const monthTitle = `${currentYear}年 ${currentMonth + 1}月`;

  // --- カレンダー作成 ---
  const getWeeksOfMonth = (year: number, month0: number): Array<Array<number | null>> => {
    const daysInMonth = new Date(year, month0 + 1, 0).getDate();
    const firstDay = new Date(year, month0, 1).getDay();
    const daysArray = Array.from({ length: daysInMonth }, (_, i) => i + 1);

    const weeks: Array<Array<number | null>> = [];
    let currentWeek: Array<number | null> = new Array(firstDay).fill(null);
    daysArray.forEach((day) => {
      currentWeek.push(day);
      if (currentWeek.length === 7) {
        weeks.push(currentWeek);
        currentWeek = [];
      }
    });
    if (currentWeek.length > 0) {
      while (currentWeek.length < 7) currentWeek.push(null);
      weeks.push(currentWeek);
    }
    return weeks;
  };

  // --- 日セル描画 ---
  const renderDayCell = (day: number | null, idx: number) => {
    if (!day)
      return <td key={`empty-${idx}`} style={{ width: 40, height: 60, backgroundColor: '#f9f9f9' }} />;

    const key = makeKey(currentYear, currentMonth, day);
    const dayPlans = plans[key] || [];

    const sorted = [...dayPlans].sort(
      (a, b) =>
        family.findIndex((f) => f.name === a.name) -
        family.findIndex((f) => f.name === b.name)
    );

    return (
      <td
        key={day}
        onClick={() => handleDayClick(day)}
        style={{
          border: '1px solid #ccc',
          verticalAlign: 'top',
          padding: 4,
          cursor: 'pointer',
          userSelect: 'none',
          backgroundColor: '#fff',
          color: '#000',
        }}
      >
        <div style={{ textAlign: 'right', fontSize: 12, marginBottom: 4 }}>{day}</div>
        <div>
          {sorted.map((p, i) => (
            <div
              key={i}
              style={{
                fontSize: 12,
                fontWeight: '700',
                color: p.color,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {p.destination}
            </div>
          ))}
        </div>
      </td>
    );
  };

  // --- 認証モーダル ---
  if (authModalVisible) {
    return (
      <div
        style={{
          height: '100vh',
          backgroundColor: '#fff',
          color: '#000',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'center',
          padding: 20,
          fontFamily: 'Arial, sans-serif',
        }}
      >
        <h1 style={{ marginBottom: 12 }}>家族カレンダー - ログイン</h1>
        <input
          type="email"
          placeholder="メールアドレス"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          style={{
            height: 36,
            width: 300,
            marginBottom: 10,
            padding: '0 10px',
            fontSize: 16,
            borderRadius: 6,
            border: '1px solid #aaa',
            backgroundColor: '#fff',
            color: '#000',
          }}
        />
        <input
          type="password"
          placeholder="パスワード"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          style={{
            height: 36,
            width: 300,
            marginBottom: 10,
            padding: '0 10px',
            fontSize: 16,
            borderRadius: 6,
            border: '1px solid #aaa',
            backgroundColor: '#fff',
            color: '#000',
          }}
        />
        {authMode === 'signin' ? (
          <>
            <button
              onClick={handleSignIn}
              style={{
                backgroundColor: '#64B5F6',
                color: 'white',
                fontWeight: '700',
                fontSize: 16,
                padding: '10px 20px',
                borderRadius: 8,
                border: 'none',
                cursor: 'pointer',
              }}
            >
              ログイン
            </button>
            <button
              onClick={() => setAuthMode('signup')}
              style={{
                marginTop: 12,
                background: 'none',
                border: 'none',
                color: '#64B5F6',
                cursor: 'pointer',
                textDecoration: 'underline',
              }}
            >
              アカウントを作成する
            </button>
          </>
        ) : (
          <>
            <button
              onClick={handleSignUp}
              style={{
                backgroundColor: '#64B5F6',
                color: 'white',
                fontWeight: '700',
                fontSize: 16,
                padding: '10px 20px',
                borderRadius: 8,
                border: 'none',
                cursor: 'pointer',
              }}
            >
              新規登録
            </button>
            <button
              onClick={() => setAuthMode('signin')}
              style={{
                marginTop: 12,
                background: 'none',
                border: 'none',
                color: '#64B5F6',
                cursor: 'pointer',
                textDecoration: 'underline',
              }}
            >
              ログインに戻る
            </button>
          </>
        )}
      </div>
    );
  }

  // --- メイン画面 ---
  return (
    <div
      style={{
        maxWidth: 900,
        margin: '20px auto',
        backgroundColor: '#fff',
        color: '#000',
        fontFamily: 'Arial, sans-serif',
        padding: '0 20px 60px',
      }}
    >
      <h1 style={{ textAlign: 'center', marginBottom: 12 }}>家族カレンダー（共有版）</h1>

      <div style={{ textAlign: 'right', marginBottom: 12 }}>
        <button
          onClick={handleSignOut}
          style={{
            backgroundColor: '#f44',
            color: 'white',
            fontWeight: '700',
            padding: '8px 14px',
            borderRadius: 6,
            border: 'none',
            cursor: 'pointer',
          }}
        >
          ログアウト
        </button>
      </div>

      {/* 家族選択 */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'center',
          flexWrap: 'wrap',
          gap: 12,
          marginBottom: 12,
        }}
      >
        {family.map((person) => (
          <button
            key={person.name}
            onClick={() => setSelectedPerson(person.name)}
            style={{
              display: 'flex',
              alignItems: 'center',
              padding: '6px 12px',
              borderRadius: 6,
              border: '1px solid #ccc',
              backgroundColor: selectedPerson === person.name ? '#eee' : '#fff',
              cursor: 'pointer',
            }}
          >
            <span
              style={{
                display: 'inline-block',
                width: 14,
                height: 14,
                backgroundColor: person.color,
                borderRadius: 3,
                marginRight: 8,
              }}
            />
            {person.name}
          </button>
        ))}
      </div>

      {/* 月切り替え */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          gap: 20,
          marginBottom: 8,
        }}
      >
        <button
          onClick={() => changeMonth(-1)}
          style={{ fontSize: 20, cursor: 'pointer', border: 'none', background: 'none' }}
        >
          ＜
        </button>
        <h2 style={{ margin: 0 }}>{monthTitle}</h2>
        <button
          onClick={() => changeMonth(1)}
          style={{ fontSize: 20, cursor: 'pointer', border: 'none', background: 'none' }}
        >
          ＞
        </button>
      </div>

      {/* カレンダー */}
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 12 }}>
        <thead>
          <tr>
            {['日', '月', '火', '水', '木', '金', '土'].map((d, i) => (
              <th
                key={d}
                style={{
                  width: '14.28%',
                  padding: 4,
                  fontWeight: 'bold',
                  color: i === 0 ? '#64B5F6' : i === 6 ? '#FFD54F' : 'black',
                  textAlign: 'center',
                  borderBottom: '2px solid #ccc',
                  backgroundColor: '#fff',
                }}
              >
                {d}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {getWeeksOfMonth(currentYear, currentMonth).map((week, wi) => (
            <tr key={wi}>{week.map((day, di) => renderDayCell(day, di))}</tr>
          ))}
        </tbody>
      </table>

 {/* モーダル */}
{modalVisible && (
  <div
    onMouseDown={() => setModalVisible(false)}
    onTouchStart={() => setModalVisible(false)}
    style={{
      position: 'fixed',
      top: 0,
      left: 0,
      width: '100vw',
      height: '100vh',
      backgroundColor: 'rgba(0,0,0,0.3)',
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      zIndex: 100,
      overflow: 'hidden',
      touchAction: 'none', // ← スクロール誤反応防止
    }}
  >
    <div
      onMouseDown={(e) => e.stopPropagation()}
      onTouchStart={(e) => e.stopPropagation()}
      style={{
        backgroundColor: 'white',
        borderRadius: 10,
        padding: 20,
        width: 300,
        textAlign: 'center',
        boxShadow: '0 0 8px rgba(0,0,0,0.25)',
      }}
    >
      <h3>行先を選択</h3>
      {destinations.map((dest) => (
        <button
          key={dest}
          onClick={() => handleSelectDestination(dest)}
          style={{
            width: '100%',
            padding: '10px 0',
            border: 'none',
            borderBottom: '1px solid #eee',
            backgroundColor: 'white',
            cursor: 'pointer',
          }}
        >
          {dest}
        </button>
      ))}
      <button
        onClick={handleDeletePlan}
        style={{
          marginTop: 12,
          backgroundColor: '#f44',
          color: 'white',
          border: 'none',
          padding: '8px 14px',
          borderRadius: 6,
          fontWeight: '700',
          cursor: 'pointer',
          width: '100%',
        }}
      >
        この予定を削除
      </button>
    </div>
  </div>
)}
    </div>
  );
}
