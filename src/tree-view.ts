import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { ExtractStringResult } from './vue-helper/common'
import vueCodeString from './vue-helper/vueCodeString'
import axios from 'axios'

interface TreeNode {
	[prop: string]: i18ns;
}

interface i18ns {
	zh_CN?: string,
	en_US?: string,
}

export class DepNodeProvider implements vscode.TreeDataProvider<Dependency> {

	private _onDidChangeTreeData: vscode.EventEmitter<Dependency | undefined | void> = new vscode.EventEmitter<Dependency | undefined | void>();
	readonly onDidChangeTreeData: vscode.Event<Dependency | undefined | void> = this._onDidChangeTreeData.event;
	private tree: TreeNode = {};
	private _languageList: []
	private _extractResult: ExtractStringResult

	constructor(private workspaceRoot: string | undefined) {
		this.refreshWebview()
	}

	// refresh(): void {
	// 	this.parseTree()
	// 	this._onDidChangeTreeData.fire(
	// 		new Dependency('222', vscode.TreeItemCollapsibleState.Collapsed)
	// 	);
	// }

	getTreeItem(treeItem: Dependency): vscode.TreeItem {
		return treeItem;
	}

	getChildren(element?: Dependency): Dependency[] {
		if (!element) {
			return Object.keys(this.tree).map(key => {
				return new Dependency(key, vscode.TreeItemCollapsibleState.Collapsed)
			})
		}
		let obj = this.tree[element.label]
		return Object.keys(obj).map(key => {
			return new Dependency(obj[key], vscode.TreeItemCollapsibleState.None, key)
		})
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

	public getNeedReplaces(vueFileContent: string) {
		this._extractResult = vueCodeString.extractStringFromVue(vueFileContent, {
			filter: code => /[\u4e00-\u9fa5]/.test(code)
		})
	}

	public replaceI18nWord(): string {

		let { extractString, result, markString, interpolationMark } = this._extractResult

		let ret = extractString.reduce((acc, cur) => {
			let reStr = cur.replaceCode
			const { originalCode } = cur
			const i18nCode = this.getI18nCode(cur.word)
			let tarStr = originalCode
			let inResultStr = `${markString[0]}${cur.index}${markString[1]}`
			if(i18nCode) {
				let generateCode = this.generateI18nFnStr(cur.replaceType, i18nCode)
				if (cur.type === 'template') { // 字符串模板
					let varArr = []
					reStr.replace(/%\$\$(.+?)\$\$%/g, ($0, $1) => {
						varArr.push($1)
						return ''
					})
					generateCode = generateCode.replace(')', `, [ ${varArr} ])`)
					inResultStr = reStr
				}
				tarStr = reStr.replace(
					inResultStr,
					generateCode
				)
			}
			acc = acc.replace(
				inResultStr,
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
			'vue-template': `$t('${code}')`,
			js: `this.$t('${code}')`,
			template: `$t('${code}')`,
		}
		return map[type]
	}

	public async refreshWebview() {
		const text = this.getCurActiveEditorText()
		this.getNeedReplaces(text)
		await this.queryI18nList()
		this._onDidChangeTreeData.fire();
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
		list.forEach(item => {
			let node = {...item}
			delete node.key
			this.tree[item.key] = node
		});
	}

	/**
	 * 清空列表
	 */
	public clearList() {
		this._languageList = []
		this._extractResult = {
			result: '',
			markString: ['', ''],
			interpolationMark: ['', ''],
			extractString: []
		}
		this.tree = {};
		this._onDidChangeTreeData.fire();
	}

	/**
	 * 根据语言发起请求
	 */
	public async queryI18nList() {
		await this._getRemoteI18nData('zh_CN')
		await this._getRemoteI18nData('en_US')
	}

	/**
	 * 通过接口获取语言数据
	 * @param lang 语言
	 */
	private async _queryI18n(lang: string) {
		const configuration = vscode.workspace.getConfiguration();
		const baseUrl: string = configuration.get('vue-i18n-query.baseUrl')
		const apiParamsPath:string = configuration.get('vue-i18n-query.apiParamsPath')
		const token: string = configuration.get('vue-i18n-query.token')

		const langReplacePath = apiParamsPath.replace('{lang}', lang)
		const url = `${baseUrl}${langReplacePath}`
		const res = await axios.get(url, {
			headers: {
				authorization: token,
			},
		})
		const resMap = res.data
		return Object.keys(resMap).map(key => {
			return { key, value: resMap[key], lang }
		})
	}

	/**
	 * 获取语言后的的数据处理
	 * @param lang 语言
	 */
	private async _getRemoteI18nData(lang: string) {
		try {
			let arr = await this._queryI18n(lang)
			this.mapLocalList(arr)
			vscode.window.showInformationMessage('获取成功！')
		} catch (error) {
			vscode.window.showErrorMessage('获取服务端多语言失败！')
		}
	}

}

export class Dependency extends vscode.TreeItem {

	constructor(
		public readonly label: string,
		public readonly collapsibleState: vscode.TreeItemCollapsibleState,
		public readonly icon?: string
	) {
		super(label, collapsibleState);
		this.label = label
		this.tooltip = `${this.label}`;
		if (icon) this.iconPath = path.join(__filename, '..', '..', 'media', `${icon}.svg`)
	}

}
