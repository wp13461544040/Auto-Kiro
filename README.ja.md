<p align="center">
  <img src="frontend/assets/appicon.svg" width="100" height="100" alt="KiroX">
</p>

<h1 align="center">KiroX</h1>

<p align="center">
  AWS Builder ID (Kiro) アカウント一括自動登録ツール
</p>

<p align="center">
  <a href="README.md">简体中文</a> ·
  <a href="README.en.md">English</a> ·
  <a href="README.ja.md">日本語</a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/version-v1.0.0-6366f1?style=flat-square" alt="version">
  <img src="https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-0078d4?style=flat-square" alt="platform">
  <img src="https://img.shields.io/badge/Go-1.24-00ADD8?style=flat-square&logo=go" alt="go">
  <img src="https://img.shields.io/badge/Wails-v2-red?style=flat-square" alt="wails">
   <a href="https://linux.do"><img src="https://img.shields.io/badge/LINUX%20DO-コミュニティ-f0b752?style=flat-square" alt="LINUX
   DO"></a>
  <img src="https://img.shields.io/badge/license-Apache%202.0-green?style=flat-square" alt="license">
</p>

---

## 概要

KiroX は [Wails v2](https://wails.io) ベースのデスクトップアプリで、AWS Builder ID アカウントの一括登録を自動化します。Outlook メールボックスプール、MoeMail 使い捨てメール、セルフホスト型 Cloud-Mail の 3 種類のメールソースに対応し、ブラウザフィンガープリント偽装・並列制御・プロキシ・自動更新を内蔵しています。

---

## 機能

**登録フロー**
- AWS Builder ID 登録の 15 ステップ完全自動化（OIDC 登録 → デバイス認可 → メール認証 → パスワード設定 → SSO → Kiro トークン交換）
- 登録後にアカウントの生存確認を自動実行
- バッチ処理：登録件数 / 並行数 / タスク間隔をすべて設定可能

**メールソース**
- **Outlook メールボックスプール**：`メール----パスワード----クライアントID----RefreshToken` 形式でインポート、IMAP で認証コードを自動取得
- **MoeMail 使い捨てメール**：複数ドメイン設定、自動ローテーション、ランダム / 全て / 指定ドメインモード
- **Cloud-Mail（セルフホスト）**：[cloud-mail](https://github.com/jiangrungen/cloud-mail) と連携、ドメインはサーバーから自動取得可能、ランダム / ラウンドロビン / 指定モード

**検出対策**
- Chrome バージョンのランダム化（120–144）
- デバイスフィンガープリントのランダム化（GPU、メモリ、CPU コア、画面解像度）
- WebGL 拡張の偽装、Canvas フィンガープリント生成
- `tls-client` による TLS フィンガープリント偽装

**データ管理**
- 登録成功アカウントは設定可能な出力ディレクトリに平文 JSON で書き出し
- Outlook アカウント情報はローカル JSON として保存
- データディレクトリと結果出力ディレクトリのカスタマイズに対応

**プロキシ**
- グローバルプロキシ（HTTP / HTTPS / SOCKS5 対応）
- `scheme://user:pass@host:port` 形式と略式 `host:port:user:pass` の両方に対応

**自動更新**
- GitHub Releases の最新バージョンを取得（セマンティックバージョン比較）
- ダウンロード時に SHA256 整合性検証 + PE ヘッダ検証
- Windows バッチスクリプトでプロセス終了後の差し替えと再起動を実行

---

## クイックスタート

### リリース版を使う

[Releases](https://github.com/wp13461544040/Auto-Kiro/releases/latest) から最新の `kirox.exe`（または macOS / Linux 用バイナリ）をダウンロードして実行するだけです。

### ソースからビルド

**必要環境**
- Go 1.24+
- Node.js 20+
- Wails CLI

```bash
# Wails CLI をインストール
go install github.com/wailsapp/wails/v2/cmd/wails@latest

# リポジトリをクローン
git clone https://github.com/wp13461544040/Auto-Kiro.git
cd Auto-Kiro

# 開発モード（ホットリロード）
wails dev

# 本番ビルド
wails build
```

ビルド成果物は `build/bin/` に出力されます。

---

## 使い方

### 1. メールを設定

**Outlook メールボックスプール**（推奨）

「メールプール」ページでアカウントをインポート、1 行 1 件、形式：
```
メール----パスワード----クライアントID----RefreshToken
```
`.txt` / `.csv` ファイルからの一括インポートにも対応、手動貼り付けも可能。

**MoeMail 使い捨てメール**

「メールプール」ページで MoeMail 設定を追加し、API アドレスと API キーを入力、接続テスト後に保存。登録時にランダム / 全て / 指定ドメインを選択可能。

**Cloud-Mail（セルフホスト）**

「メールプール」ページで Cloud-Mail 設定を追加し、サーバー URL、管理者メール、パスワードを入力。ドメイン欄は空欄でも OK で、その場合 KiroX が `/api/setting/websiteConfig` から自動取得します。

### 2. 登録を開始

「登録」ページに切り替え：
- 登録件数、並行数（1–5 推奨）、タスク間隔（秒）を設定
- メールソースを選択
- 「登録開始」をクリック

### 3. 結果を確認

成功したアカウントは結果出力ディレクトリ（デフォルト `~/Documents/Kirox`）にリアルタイムで `accounts.json` として書き込まれます：

```json
[
  {
    "email": "xxx@outlook.com",
    "password": "...",
    "access_token": "...",
    "refresh_token": "...",
    "registered_at": "2026-05-31T12:00:00Z"
  }
]
```

### 4. プロキシ設定

「設定」ページでプロキシアドレスを入力、以下の形式に対応：
```
http://user:pass@host:port
socks5://host:port
host:port:user:pass
```
空欄なら直接接続。

---

## プロジェクト構成

```
kirox/
├── main.go                    # エントリポイント、Wails 初期化
├── app.go                     # App 構造体、Wails バインドメソッド
├── internal/
│   ├── core/                  # 登録コア（15 ステップフロー）
│   │   ├── registrar.go       # Registrar 構造体、HTTP クライアント
│   │   ├── run.go             # ステップオーケストレーション
│   │   ├── auth.go            # ステップ 1–5
│   │   ├── signup_flow.go     # ステップ 6–9
│   │   ├── signup_password.go # ステップ 10–12
│   │   ├── kiro_auth.go       # ステップ 13–14
│   │   ├── kiro_exchange.go   # ステップ 15
│   │   └── verify.go          # アカウント生存確認
│   ├── browser/               # ブラウザフィンガープリント
│   ├── email/                 # メールプロバイダ（Outlook / MoeMail / Cloud-Mail）
│   ├── crypto/                # JWE 暗号化、XXTEA
│   ├── storage/               # アカウント保存、設定永続化
│   ├── task/                  # バッチスケジューリング、並行制御
│   ├── data/                  # 結果 I/O
│   ├── proxy/                 # 出口 IP / 地域検出
│   ├── subscription/          # サブスクリプションリンク：トークン更新 + listAvailableSubscriptions / CreateSubscriptionToken / setUserPreference
│   ├── updater/               # 自動更新
│   └── http/                  # TLS クライアントヘルパ
└── frontend/
    ├── index.html             # シングルページエントリ
    ├── js/                    # ページロジック（overview / accounts / moemail / cloudmail / task / subscription / app / ui / i18n）
    ├── css/                   # スタイル（layout / components / style）
    └── build.js               # フロントエンドビルドスクリプト
```

---

## 技術スタック

| レイヤ | 技術 |
|----|------|
| デスクトップフレームワーク | [Wails v2](https://wails.io) |
| バックエンド | Go 1.24 |
| HTTP クライアント | [bogdanfinn/tls-client](https://github.com/bogdanfinn/tls-client) |
| フロントエンド | ネイティブ HTML / CSS / JavaScript |
| 暗号化 | RSA-OAEP-256 + AES-256-GCM (JWE) |

---

## 注意事項

- 本ツールは学習・研究目的のみで使用し、AWS の利用規約を遵守してください
- IP レート制限を避けるため、プロキシの併用を強く推奨
- Outlook アカウントは有効な RefreshToken を事前に準備する必要があります
- 並行数が高すぎると AWS のリスク管理にかかる可能性があり、低い並行数から徐々に上げるのを推奨

---

## FAQ

### IP クリーン度関連

実行中に下記いずれかのエラーが発生する場合、出口 IP が AWS / Microsoft のリスク管理対象になっている可能性が高いです。

**ケース 1：メール認証コード送信が OTP 400 を返す**

![ケース 1](docs/images/1.png)
![ケース 1](docs/images/3.png)

よりクリーンな住宅プロキシへ切り替えてください。

> セルフホストメールや使い捨てメール（MoeMail など）使用時は、ドメイン自体が Microsoft / AWS にブラックリスト入りしている可能性もあるため、別ドメインを試してみてください。

**ケース 2：登録フローが停止するかメールにアクセスできない**

![ケース 2](docs/images/2.png)

同じプロキシ設定の実ブラウザで [outlook.live.com](https://outlook.live.com) を開いてみてください：

- ブラウザでも開けない / CAPTCHA → IP が Microsoft によりブロック、プロキシ変更が必要
- ブラウザでは正常 → Outlook アカウントの RefreshToken の有効性を確認

### macOS で「アプリが破損している」と表示される

未署名アプリは Gatekeeper により初回起動がブロックされます。ターミナルで以下のコマンドを実行して隔離属性を削除してください：

```bash
xattr -cr /path/to/KiroX.app
```

`/path/to/KiroX.app` を実際のパスに置き換えてください（`KiroX.app` をターミナルにドラッグすると自動入力されます）。

---

## 作者

**wp** · [@wp13461544040](https://github.com/wp13461544040)

Copyright © 2026

---

## ライセンス

本プロジェクトは [Apache License 2.0](LICENSE) の下で公開されています。

```
Copyright 2026 wp

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
```
