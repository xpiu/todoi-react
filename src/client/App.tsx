import { ItemList } from "./items/ItemList";

export function App() {
  return (
    <div className="td-app">
      <main className="td-app-main">
        <h1 className="td-app-title">Todoi</h1>
        <ItemList />
      </main>
    </div>
  );
}
