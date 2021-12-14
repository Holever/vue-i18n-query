(function () {
  const vscode = acquireVsCodeApi();

  const ulEl = $('.i18n-list')
  // const queryBtnEl = $('.re-query')

  // const oldState = vscode.getState() || { remoteList: [] };
  // let remoteList = oldState.remoteList;
  
  // updateList(remoteList)
  
  // queryBtnEl.addEventListener('click', () => {
  //   vscode.postMessage({ type: 'GET_DATA' })
  // })

  window.addEventListener('message', event => {
    const message = event.data; // The json data that the extension sent
    console.log('message: ', message);
    switch (message.type) {
      case 'QUERY_FINISH':
        {
          let list = message.data
          updateList(list)
          break;
        }
        case 'CLEAR':
        {
          updateList([])
          break;
        }

    }
  });

  function updateList(list) {
    ulEl.innerHTML = ''
    let iconMap = {
      zh_CN : '★',
      en_US : '▧',
      key: '☞',
    }
    list.forEach(ele => {
      const liEl = document.createElement('li');
      liEl.className = 'i18n-entry';
      let i18nItemEl = document.createElement('div')
      i18nItemEl.className = 'i18n-item'
  
      liEl.appendChild(i18nItemEl)
      Object.keys(ele).forEach(key => {
        let labelEl = document.createElement('div')
        labelEl.className = `value value-${key}`
        labelEl.textContent = `${iconMap[key] || key} ${ele[key]}`
        i18nItemEl.appendChild(labelEl)
      })
      ulEl.appendChild(liEl)
    });
    vscode.setState({
      remoteList: list
    })
  }

  function $(selector) {
    return document.querySelector(selector)
  }
}())