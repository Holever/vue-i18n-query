import * as vscode from 'vscode'
import axios from 'axios'
import vueCodeString from './vue-helper/vueCodeString'
import { ExtractStringResult } from './vue-helper/common'

export async function activate(context: vscode.ExtensionContext) {
  const provider = new VueI18nViewProvider(context.extensionUri)

  context.subscriptions.push(vscode.window.registerWebviewViewProvider(VueI18nViewProvider.viewType, provider))

  context.subscriptions.push(vscode.commands.registerCommand('vueI18nQuery.query', () => {
    provider.refreshWebview()
  }))

  context.subscriptions.push(vscode.commands.registerCommand('vueI18nQuery.replace', () => {
    provider.replaceCode()
  }))

  context.subscriptions.push(vscode.commands.registerCommand('vueI18nQuery.clear', () => {
    provider.clearList()
  }))

}

class VueI18nViewProvider implements vscode.WebviewViewProvider {

  public static readonly viewType = "vueI18nQuery.preview"

  private _view?: vscode.WebviewView
  private _extensionUri?: vscode.Uri
  private _languageList: []
  private _extractResult: ExtractStringResult

  constructor(extensionUri: vscode.Uri) {
    this._extensionUri = extensionUri
    vscode.window.onDidChangeActiveTextEditor(() => this.onActiveEditorChanged());
  }

  public resolveWebviewView(
    webviewView: vscode.WebviewView,
    context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ) {
    this._view = webviewView

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [
        this._extensionUri
      ]
    }

    webviewView.webview.html = this._getHtmlForWebView(webviewView.webview)

    // 接受postMessage事件
    webviewView.webview.onDidReceiveMessage(data => {
      switch (data.type) {
        case 'GET_DATA':
          {
            this.queryI18nList()
            break;
          }
      }
    });
  }

  public onActiveEditorChanged() {
    this.clearList()
  }

  public getCurActiveEditorText(): string {
    const activeTextEditor = vscode.window.activeTextEditor
    if (activeTextEditor) {
      if (activeTextEditor.document.uri.scheme === 'file') {
        const enabled = activeTextEditor.document.languageId === 'vue';
        if (enabled) {
          const text = activeTextEditor.document.getText();
          return text
        }
      }
    }
    return ''
  }

  public replaceCode() {
    const text = this.getCurActiveEditorText()
    this.getNeedReplaces(text)
    this.refresh(text, vscode.window.activeTextEditor)
  }

  public refresh(content: string, editor: vscode.TextEditor) {
    const allRange = new vscode.Range(editor.document.positionAt(0), editor.document.positionAt(content.length))
    const replaceStr = this.replaceI18nWord()
    editor.edit(eb => eb.replace(allRange, replaceStr))
  }

  public getNeedReplaces(vueFileContent) {
    this._extractResult = vueCodeString.extractStringFromVue(vueFileContent, {
      filter: code => /[\u4e00-\u9fa5]/.test(code)
    })
  }

  public replaceI18nWord(): string {

    let { extractString, result, markString, interpolationMark } = this._extractResult

    let ret = extractString.reduce((acc, cur) => {
      let reStr = cur.replaceCode
      let generateCode = this.generateI18nFnStr(cur.replaceType, this.getI18nCode(cur.word));
      if (cur.type === 'template') { // 字符串模板
        let varArr = []
        reStr.replace(/%\$\$(.+?)\$\$%/g, ($0, $1) => {
          varArr.push($1)
          return ''
        })
        generateCode = generateCode.replace(')', `, [ ${varArr} ])`)
      }
      let tarStr = cur.replaceCode.replace(
        reStr,
        generateCode
      )
      acc = acc.replace(
        reStr,
        tarStr
      )
      return acc
    }, result)
    return ret
  }

  public getI18nCode(chineseChar: string): string {
    let arr = this._languageList || []
    let find: any = arr.find(item => item['zh_CN'] === chineseChar)
    return find ? find.key : ''
  }

  /**
   * generateI18nFnStr
  */
  public generateI18nFnStr(type: string, code: string): string {
    let map = {
      attr: `$t('${code}')`,
      js: `this.$t('${code}')`,
    }
    return map[type]
  }

  public refreshWebview() {
    const text = this.getCurActiveEditorText()
    this.getNeedReplaces(text)
    this.queryI18nList()
  }

  /**
   * 匹配当前编辑文件数据，生成列表
   * @param queryList 请求到的数据列表
   */
  public mapLocalList(queryList) {
    let oldList = this._languageList || [];
    let chineseList = this._extractResult.extractString.map(item => item.word)
    let list = queryList.reduce((acc, cur) => {
      let find = acc.find(item => item.key === cur.key)
      if (find) {
        find[cur.lang] = cur.value
      } else {
        const value = cur.value
        cur[cur.lang] = value
        delete cur.value
        delete cur.lang
        chineseList.includes(value) && acc.push(cur)
      }
      return acc
    }, oldList)
    this._languageList = list
    this._view.webview.postMessage({ type: 'QUERY_FINISH', data: this._languageList || [] });
  }

  /**
   * 清空列表
   */
  public clearList() {
    if (this._view) {
      this._languageList = []
      this._extractResult = {
        result: '',
        markString: ['', ''],
        interpolationMark: ['', ''],
        extractString: []
      }
      this._view.webview.postMessage({ type: 'CLEAR' });
    }
  }

  private _getHtmlForWebView(webview: vscode.Webview) {

    const styleResetUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'reset.css'))
    const styleVSCodeUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'vscode.css'))
    const styleMainUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'main.css'))

    const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'main.js'))

    const nonce = getNonce();

    return `<!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">

      <meta name="viewport" content="width=device-width, initial-scale=1.0">

      <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; script-src 'nonce-${nonce}';">

      <link href="${styleResetUri}" rel="stylesheet">
      <link href="${styleVSCodeUri}" rel="stylesheet">
      <link href="${styleMainUri}" rel="stylesheet">
      
      <title>query vue i18n</title>
    </head>
    <body>
      <ul class="i18n-list">
      </ul>


      <script nonce="${nonce}" src="${scriptUri}"></script>
    </body>
    </html>`
  }

  /**
   * 根据语言发起请求
   */
   public async queryI18nList() {
    await this._getRemoteI18nData('zh_CN')
    await this._getRemoteI18nData('en_US')
    vscode.window.showInformationMessage('更新成功！')
  }

  /**
   * 通过接口获取语言数据
   * @param lang 语言
   */
  private async _queryI18n(lang: string){
    const configuration = vscode.workspace.getConfiguration();
    let baseUrl:string = configuration.get('vue-i18n-query.baseUrl')
    let token:string = configuration.get('vue-i18n-query.token')
    let promptKeys:string[] = configuration.get('vue-i18n-query.promptKeys')
    const url = `${baseUrl}/api/hpfm/v1/0/prompt/${lang}?page=0&promptKey=${promptKeys}&size=100000`
    let res = await axios.get(url, {
      headers: {
        authorization: token,
      },
    })
    let resMap = res.data
    return Object.keys(resMap).map(key => {
      return { key, value: resMap[key], lang }
    })
  }

  /**
   * 获取语言后的的数据处理
   * @param lang 语言
   */
  private async _getRemoteI18nData(lang: string) {
    let arr = await this._queryI18n(lang)
    this.mapLocalList(arr)
  }
}

function getNonce() {
  let text = '';
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}
