// Garante compatibilidade tanto no Chrome quanto no Firefox
const extAPI = typeof browser !== 'undefined' ? browser : chrome;

// ============================================================================
// LÓGICA DAS ABAS (NAVEGAÇÃO)
// ============================================================================
const navAcoes = document.getElementById('navAcoes');
const navBusca = document.getElementById('navBusca');
const tabAcoes = document.getElementById('tabAcoes');
const tabBusca = document.getElementById('tabBusca');

if (navAcoes && navBusca) {
    navAcoes.addEventListener('click', () => {
        navAcoes.classList.add('active');
        navBusca.classList.remove('active');
        tabAcoes.classList.add('active');
        tabBusca.classList.remove('active');
    });

    navBusca.addEventListener('click', () => {
        navBusca.classList.add('active');
        navAcoes.classList.remove('active');
        tabBusca.classList.add('active');
        tabAcoes.classList.remove('active');
    });
}

// ============================================================================
// FUNÇÕES AUXILIARES DE LEITURA DAS CAIXAS DE TEXTO
// ============================================================================
function getProcessList() {
    const raw = document.getElementById('processos')?.value || '';
    const matches = raw.match(/[\d.]+/g) || [];
    return matches
        .map(numStr => numStr.replace(/\./g, ''))
        .filter(numStr => numStr.length > 0)
        .map(Number);
}

function getProtocolList() {
    const raw = document.getElementById('listaProtocolos')?.value || '';
    return raw.split('\n').map(p => p.trim()).filter(p => p.length > 0);
}

// ============================================================================
// SCRIPTS INJETADOS (Estes rodam dentro da página do Mapa e retornam os logs)
// ============================================================================

async function scriptAtribuir(processos, usuarioDestino) {
    const ssoTicket = document.cookie.match(/(?:^|; )LecomSSOTicket=([^;]*)/)?.[1];
    if (!ssoTicket) return ["❌ ERRO: LecomSSOTicket não encontrado nos cookies."];

    let logs = [`🚀 Iniciando atribuição de ${processos.length} processos para: ${usuarioDestino}...`];
    let myUserId = 2722; 
    try {
        const userRes = await fetch(`https://mapa.servicos.gov.br/workspace/api/user-logged`, { headers: { "ticket-sso": ssoTicket, "Accept": "application/json" } });
        if (userRes.ok) { const userData = await userRes.json(); myUserId = userData.id || userData.userId || userData.codigo || 2722; }
    } catch(e) {}

    for (let i = 0; i < processos.length; i++) {
        const id = processos[i];
        try {
            const infoRes = await fetch(`https://mapa.servicos.gov.br/workspace/api/process/${id}/user/${myUserId}`, { headers: { "ticket-sso": ssoTicket, "Accept": "application/json" } });
            if (!infoRes.ok) { logs.push(`❌ Falha ao ler processo ${id}.`); continue; }
            const processData = await infoRes.json();
            const activityId = processData?.instance?.currentActivityInstanceId;
            const cycle = processData?.instance?.currentCycle;
            
            if (!activityId) { logs.push(`⚠️ Processo ${id} sem atividade atual.`); continue; }

            const payload = { values: [usuarioDestino], instances: [{ processInstanceId: id, activityInstanceId: activityId, cycle: cycle }], type: "USER" };
            const assignRes = await fetch("https://mapa.servicos.gov.br/workspace/api/process/process-instances/assign-to-users", {
                method: "POST", headers: { "Content-Type": "application/json", "ticket-sso": ssoTicket }, body: JSON.stringify(payload)
            });
            if (assignRes.ok) {
                logs.push(`✅ Processo ${id} atribuído com sucesso!`);
            } else {
                logs.push(`❌ Erro ao atribuir o processo ${id}.`);
            }
        } catch (error) { 
            logs.push(`❌ Erro no processo ${id}: ${error.message}`); 
        }
        // Espera 1 segundo para não sobrecarregar a API
        await new Promise(resolve => setTimeout(resolve, 1000));
    }
    logs.push("🎯 Atribuição finalizada.");
    return logs;
}

async function scriptAbrirAbas(processos, abrirFormulario) {
    if (!abrirFormulario) {
        processos.forEach((id, index) => { setTimeout(() => { window.open(`https://mapa.servicos.gov.br/workspace/flow/${id}`, '_blank'); }, index * 500); });
        return ["✅ Abas abertas."];
    }
    const ssoTicket = document.cookie.match(/(?:^|; )LecomSSOTicket=([^;]*)/)?.[1];
    let myUserId = 2722; 
    let logs = [`🚀 Abrindo formulários de ${processos.length} processos...`];

    for (let i = 0; i < processos.length; i++) {
        const id = processos[i];
        try {
            const infoRes = await fetch(`https://mapa.servicos.gov.br/workspace/api/process/${id}/user/${myUserId}`, { headers: { "ticket-sso": ssoTicket, "Accept": "application/json" } });
            if (infoRes.ok) {
                const data = await infoRes.json();
                if (data.instance.currentActivityInstanceId) {
                    window.open(`https://mapa.servicos.gov.br/workspace/form-app/${id}/${data.instance.currentActivityInstanceId}/${data.instance.currentCycle}?isNewForm=true`, '_blank');
                    logs.push(`🔗 Aba aberta para o processo ${id}`);
                }
            }
        } catch (error) {}
        await new Promise(resolve => setTimeout(resolve, 1000));
    }
    logs.push("🎯 Concluído.");
    return logs;
}

async function scriptMoverFinanceira(processosIds, fileName, fileType, base64data) {
    const ssoTicket = document.cookie.match(/(?:^|; )LecomSSOTicket=([^;]*)/)?.[1];
    if (!ssoTicket) return ["❌ ERRO: SSO não encontrado nos cookies."];

    let logs = [`🚀 Iniciando envio de ${processosIds.length} processo(s) para a Financeira...`];
    let blob = null;
    let safeFileName = null; 

    if (base64data) {
        try {
            const fetchRes = await fetch(base64data);
            blob = await fetchRes.blob();
            safeFileName = fileName.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9.\-_]/g, '_');
            logs.push(`Nome do arquivo ajustado: ${safeFileName}`);
        } catch(e) {
            return ["❌ Erro ao ler o arquivo selecionado."];
        }
    }

    let sucesso = 0, falha = 0, myUserId = 2722;

    for (let i = 0; i < processosIds.length; i++) {
        const id = processosIds[i];
        try {
            const resDet = await fetch(`https://mapa.servicos.gov.br/workspace/api/process/${id}/user/${myUserId}`, { headers: { "ticket-sso": ssoTicket, "Accept": "application/json" } });
            if (!resDet.ok) throw new Error(`Falha ao ler processo (HTTP ${resDet.status})`);
            
            const dataDet = await resDet.json();
            const actId = dataDet.instance.currentActivityInstanceId;
            const cycle = dataDet.instance.currentCycle;

            let fileUniqueId = null;

            if (blob) {
                const file = new File([blob], safeFileName, { type: fileType });
                const formData = new FormData();
                formData.append("file", file);

                // CORREÇÃO DO ERRO HTTP 400 (NotNull no campo 'templateId'):
                // A API rejeita string vazia como "nulo". O .har de uma movimentação
                // manual bem-sucedida mostra que o valor correto é "1".
                formData.append("templateId", "1");

                // CORREÇÃO: campo 'fileName' também é exigido pela API e estava ausente.
                formData.append("fileName", safeFileName);
                
                const uploadUrl = `https://mapa.servicos.gov.br/bpm/api/v2/process-instances/${id}/activity-instances/${actId}/cycles/${cycle}/fields/OFICIO_AUTORIZACAO/documents/import`;
                
                const uploadRes = await fetch(uploadUrl, { method: "POST", headers: { "ticket-sso": ssoTicket, "Accept": "application/json" }, body: formData });
                
                if (!uploadRes.ok) {
                    const errText = await uploadRes.text();
                    throw new Error(`Erro de upload HTTP ${uploadRes.status}: ${errText.substring(0, 50)}...`);
                }
                
                const uploadData = await uploadRes.json();
                fileUniqueId = uploadData.content.fileUniqueId;
                logs.push(`📎 Anexo incluído no processo ${id}`);
            }

            // CORREÇÃO DO ERRO HTTP 406: a API faz negociação de conteúdo e rejeita
            // o Accept genérico "application/json". O .har real mostra o valor exato
            // exigido, além dos headers "language" e "form-uuid" que o front-end sempre envia.
            const headersPadrao = {
                "ticket-sso": ssoTicket,
                "Accept": "application/json;charset=UTF-8, application/json;q=0.8, text/plain;q=0.5, */*;q=0.2",
                "language": "pt_BR",
                "form-uuid": (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`)
            };

            // CORREÇÃO: o endpoint antigo (form-service/api/process-instances/{id}/form-data)
            // não existe mais nesta versão do sistema (HTTP 404). Confirmado no .har real,
            // os valores atuais do formulário vêm de form-web/api/form/form-initial-values,
            // e o formId + lista de grids (para o datagridCommands) vêm de form-web/api/form/start.
            const resValues = await fetch(`https://mapa.servicos.gov.br/form-web/api/form/form-initial-values?processInstanceId=${id}&activityInstanceId=${actId}&cycle=${cycle}`, { headers: headersPadrao });
            if (!resValues.ok) throw new Error(`Falha ao ler valores do formulário (HTTP ${resValues.status})`);
            const dataValues = await resValues.json();
            let valuesArray = (dataValues?._embedded?.fieldInitialValues || []).map(f => ({ id: f.fieldId, value: f.value }));

            const resStart = await fetch(`https://mapa.servicos.gov.br/form-web/api/form/start?processInstanceId=${id}&activityInstanceId=${actId}&cycle=${cycle}&isMobile=false`, { headers: headersPadrao });
            if (!resStart.ok) throw new Error(`Falha ao ler estrutura do formulário (HTTP ${resStart.status})`);
            const dataStart = await resStart.json();
            const formIdAtual = dataStart?.form?.id || 330103;
            let datagridCommands = (dataStart?.form?.fields || [])
                .filter(f => f.type === "GRID")
                .map(f => ({ [f.id]: [] }));

            const setFieldValue = (fieldId, fieldValue) => {
                let field = valuesArray.find(f => f.id === fieldId);
                if (field) { field.value = fieldValue; } else { valuesArray.push({ id: fieldId, value: fieldValue }); }
            };

            setFieldValue("ANALISE_FEDERAL", "Enviar para análise financeira");
            setFieldValue("MSG_ANALISE_FINANCEIRA", "Encaminhado via movimentação em lote automatizada.");
            if (fileUniqueId) {
                setFieldValue("OFICIO_AUTORIZACAO", `${safeFileName}:${fileUniqueId}`);
            }

            // CORREÇÃO: payload alinhado com o formato real aceito pela API (visto no .har),
            // que exige processInstanceId/activityInstanceId/cycle/action tanto dentro de
            // "data" quanto no nível raiz, além do campo "dataPrint".
            const payload = {
                formId: formIdAtual,
                submitFormActionId: "",
                data: {
                    values: valuesArray,
                    datagridCommands: datagridCommands,
                    processInstanceId: String(id),
                    activityInstanceId: String(actId),
                    cycle: String(cycle),
                    action: "P"
                },
                dataPrint: null,
                processInstanceId: String(id),
                activityInstanceId: String(actId),
                cycle: String(cycle),
                action: "P"
            };

            const resSubmit = await fetch("https://mapa.servicos.gov.br/form-app/workflow-service/process-instances/complete-activity", {
                method: "POST", headers: { "ticket-sso": ssoTicket, "Content-Type": "application/json" }, body: JSON.stringify(payload)
            });

            if (resSubmit.ok) { 
                logs.push(`✅ Processo ${id} enviado para a Financeira!`); 
                sucesso++; 
            } else { 
                const errText = await resSubmit.text();
                throw new Error(`Falha envio da etapa HTTP ${resSubmit.status}: ${errText.substring(0, 120)}`); 
            }

        } catch(e) {
            falha++;
            logs.push(`❌ Processo ${id}: ${e.message}`);
        }
        await new Promise(resolve => setTimeout(resolve, 1200));
    }
    
    logs.push(`\n🎯 Movimentação Finalizada!\n✔️ Sucessos: ${sucesso}\n❌ Falhas: ${falha}`);
    return logs;
}

// ============================================================================
// DEVOLVER FINANCEIRA ➔ FEDERAL
// Baseado no .har de uma devolução manual bem-sucedida: não precisa de anexo,
// o campo de decisão é "ANALISE_BANCO" e o código da ação é "R" (em vez de "P").
// ============================================================================
async function scriptVoltarFederal(processosIds) {
    const ssoTicket = document.cookie.match(/(?:^|; )LecomSSOTicket=([^;]*)/)?.[1];
    if (!ssoTicket) return ["❌ ERRO: SSO não encontrado nos cookies."];

    let logs = [`🚀 Iniciando devolução de ${processosIds.length} processo(s) para a Federal...`];
    let sucesso = 0, falha = 0, myUserId = 2722;

    const headersPadrao = {
        "ticket-sso": ssoTicket,
        "Accept": "application/json;charset=UTF-8, application/json;q=0.8, text/plain;q=0.5, */*;q=0.2",
        "language": "pt_BR",
        "form-uuid": (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`)
    };

    for (let i = 0; i < processosIds.length; i++) {
        const id = processosIds[i];
        try {
            const resDet = await fetch(`https://mapa.servicos.gov.br/workspace/api/process/${id}/user/${myUserId}`, { headers: { "ticket-sso": ssoTicket, "Accept": "application/json" } });
            if (!resDet.ok) throw new Error(`Falha ao ler processo (HTTP ${resDet.status})`);

            const dataDet = await resDet.json();
            const actId = dataDet.instance.currentActivityInstanceId;
            const cycle = dataDet.instance.currentCycle;

            const resValues = await fetch(`https://mapa.servicos.gov.br/form-web/api/form/form-initial-values?processInstanceId=${id}&activityInstanceId=${actId}&cycle=${cycle}`, { headers: headersPadrao });
            if (!resValues.ok) throw new Error(`Falha ao ler valores do formulário (HTTP ${resValues.status})`);
            const dataValues = await resValues.json();
            let valuesArray = (dataValues?._embedded?.fieldInitialValues || []).map(f => ({ id: f.fieldId, value: f.value }));

            const resStart = await fetch(`https://mapa.servicos.gov.br/form-web/api/form/start?processInstanceId=${id}&activityInstanceId=${actId}&cycle=${cycle}&isMobile=false`, { headers: headersPadrao });
            if (!resStart.ok) throw new Error(`Falha ao ler estrutura do formulário (HTTP ${resStart.status})`);
            const dataStart = await resStart.json();
            const formIdAtual = dataStart?.form?.id || 330885;
            let datagridCommands = (dataStart?.form?.fields || [])
                .filter(f => f.type === "GRID")
                .map(f => ({ [f.id]: [] }));

            const setFieldValue = (fieldId, fieldValue) => {
                let field = valuesArray.find(f => f.id === fieldId);
                if (field) { field.value = fieldValue; } else { valuesArray.push({ id: fieldId, value: fieldValue }); }
            };

            // Campo de decisão do formulário da etapa Financeira e mensagem interna
            setFieldValue("ANALISE_BANCO", "Devolver para etapa de Análise Federal");
            setFieldValue("COMUNICACAO_INTERNA", "Solicitação devolvida via movimentação em lote automatizada.");

            const payload = {
                formId: formIdAtual,
                submitFormActionId: "",
                data: {
                    values: valuesArray,
                    datagridCommands: datagridCommands,
                    processInstanceId: String(id),
                    activityInstanceId: String(actId),
                    cycle: String(cycle),
                    action: "R"
                },
                dataPrint: null,
                processInstanceId: String(id),
                activityInstanceId: String(actId),
                cycle: String(cycle),
                action: "R"
            };

            const resSubmit = await fetch("https://mapa.servicos.gov.br/form-app/workflow-service/process-instances/complete-activity", {
                method: "POST", headers: { "ticket-sso": ssoTicket, "Content-Type": "application/json" }, body: JSON.stringify(payload)
            });

            if (resSubmit.ok) {
                logs.push(`✅ Processo ${id} devolvido para a Federal!`);
                sucesso++;
            } else {
                const errText = await resSubmit.text();
                throw new Error(`Falha na devolução HTTP ${resSubmit.status}: ${errText.substring(0, 120)}`);
            }

        } catch (e) {
            falha++;
            logs.push(`❌ Processo ${id}: ${e.message}`);
        }
        await new Promise(resolve => setTimeout(resolve, 1200));
    }

    logs.push(`\n🎯 Devolução Finalizada!\n✔️ Sucessos: ${sucesso}\n❌ Falhas: ${falha}`);
    return logs;
}

async function scriptBuscarProtocolo(protocolos) {
    const ssoTicket = document.cookie.match(/(?:^|; )LecomSSOTicket=([^;]*)/)?.[1];
    if (!ssoTicket) return ["❌ ERRO: SSO não encontrado."];

    const url = `https://mapa.servicos.gov.br/workspace/api/process/search?page=0&size=30`;
    let resultados = [];

    for (let prot of protocolos) {
        try {
            const payload = {
                "processId": 46, "version": 12, "status": [], "periodMode": "PROCESSES_OPENED_IN", "period": "custom",
                "startDate": "2020-03-18T03:00:00.789Z", "endDate": "2026-06-16T18:00:58.790Z",
                "allVersions": true, "onlyActives": true, "searchableFields": [ { "id": "PROTOCOLO", "value": [prot] } ], "multipleFilters": []
            };
            const res = await fetch(url, { method: "POST", headers: { "ticket-sso": ssoTicket, "Content-Type": "application/json" }, body: JSON.stringify(payload) });
            const data = await res.json();
            const processos = data.content || data.items || data || [];
            if (processos.length > 0) {
                resultados.push(`${processos[0].id || processos[0].processInstanceId}`);
            } else {
                resultados.push(`${prot} -> NÃO ENCONTRADO`);
            }
        } catch (error) { 
            resultados.push(`${prot} -> FALHA`); 
        }
    }
    return resultados;
}

// ============================================================================
// EVENTOS DOS BOTÕES NO POPUP (Tratando as respostas na interface)
// ============================================================================

const divRes = document.getElementById('resultadoProtocolos');

const btnAtribuir = document.getElementById('btnAtribuir');
if (btnAtribuir) {
    btnAtribuir.addEventListener('click', async () => {
        const processos = getProcessList();
        const usuarioDestino = document.getElementById('usuarioDestino')?.value;
        if (processos.length === 0) return alert("⚠️ Insira pelo menos um ID de processo.");
        let tabs = await extAPI.tabs.query({ active: true, currentWindow: true });
        if (!tabs[0] || !tabs[0].url.includes("mapa.servicos.gov.br")) return alert("⚠️ Aba do Mapa não ativa.");
        
        divRes.innerHTML = "Executando atribuição... Mantenha a extensão aberta ⏳";
        
        try {
            const injection = await extAPI.scripting.executeScript({ target: { tabId: tabs[0].id }, func: scriptAtribuir, args: [processos, usuarioDestino] });
            if (injection && injection[0].result) { divRes.innerHTML = injection[0].result.join('<br>'); }
        } catch (err) { divRes.innerHTML = "❌ Erro: " + err.message; }
    });
}

const btnAbrir = document.getElementById('btnAbrir');
if (btnAbrir) {
    btnAbrir.addEventListener('click', async () => {
        const processos = getProcessList();
        const abrirForm = document.getElementById('chkAbrirFormulario')?.checked; 
        if (processos.length === 0) return alert("⚠️ Insira pelo menos um ID.");
        let tabs = await extAPI.tabs.query({ active: true, currentWindow: true });
        
        divRes.innerHTML = "Abrindo abas... ⏳";
        
        try {
            const injection = await extAPI.scripting.executeScript({ target: { tabId: tabs[0].id }, func: scriptAbrirAbas, args: [processos, abrirForm] });
            if (injection && injection[0].result) { divRes.innerHTML = injection[0].result.join('<br>'); }
        } catch (err) { divRes.innerHTML = "❌ Erro: " + err.message; }
    });
}

const btnBuscar = document.getElementById('btnBuscarProtocolos');
if (btnBuscar) {
    btnBuscar.addEventListener('click', async () => {
        const protocolos = getProtocolList();
        if (protocolos.length === 0) return alert("⚠️ Insira pelo menos um protocolo.");
        let tabs = await extAPI.tabs.query({ active: true, currentWindow: true });
        
        divRes.innerHTML = "Pesquisando protocolos... ⏳";
        
        try {
            const injection = await extAPI.scripting.executeScript({ target: { tabId: tabs[0].id }, func: scriptBuscarProtocolo, args: [protocolos] });
            if (injection && injection[0].result) { divRes.innerHTML = injection[0].result.join('<br>'); }
        } catch (err) { divRes.innerHTML = "❌ Erro: " + err.message; }
    });
}

// ============================================================================
// SELETOR DE TIPO DE MOVIMENTAÇÃO (Federal ➔ Financeira / Financeira ➔ Federal)
// ============================================================================
const selTipoMovimentacao = document.getElementById('tipoMovimentacao');
const blocoAnexoOficio = document.getElementById('blocoAnexoOficio');
const btnMoverEtapa = document.getElementById('btnMoverEtapa');

function atualizarUiMovimentacao() {
    if (!selTipoMovimentacao || !blocoAnexoOficio || !btnMoverEtapa) return;
    if (selTipoMovimentacao.value === 'federal_financeira') {
        blocoAnexoOficio.style.display = 'block';
        btnMoverEtapa.textContent = 'Mover Federal ➔ Financeira';
    } else {
        blocoAnexoOficio.style.display = 'none';
        btnMoverEtapa.textContent = 'Devolver Financeira ➔ Federal';
    }
}

if (selTipoMovimentacao) {
    selTipoMovimentacao.addEventListener('change', atualizarUiMovimentacao);
    atualizarUiMovimentacao(); // estado inicial
}

if (btnMoverEtapa) {
    btnMoverEtapa.addEventListener('click', async () => {
        const processosIds = getProcessList();
        if (processosIds.length === 0) return alert("⚠️ Insira os IDs na lista.");
        let tabs = await extAPI.tabs.query({ active: true, currentWindow: true });
        if (!tabs[0] || !tabs[0].url.includes("mapa.servicos.gov.br")) return alert("⚠️ Entre no site do Mapa.");

        const tipo = selTipoMovimentacao ? selTipoMovimentacao.value : 'federal_financeira';

        if (tipo === 'financeira_federal') {
            // Devolver Financeira ➔ Federal: não precisa de anexo
            divRes.innerHTML = "Executando devolução para a Federal... Mantenha a aba aberta ⏳";
            try {
                const injection = await extAPI.scripting.executeScript({
                    target: { tabId: tabs[0].id },
                    func: scriptVoltarFederal,
                    args: [processosIds]
                });
                if (injection && injection[0].result) { divRes.innerHTML = injection[0].result.join('<br>'); }
            } catch (err) { divRes.innerHTML = "❌ Erro de injeção: " + err.message; }
            return;
        }

        // Federal ➔ Financeira (comportamento original, com anexo opcional)
        const arquivoInput = document.getElementById('arquivoOficio');
        const arquivo = (arquivoInput && arquivoInput.files.length > 0) ? arquivoInput.files[0] : null;

        divRes.innerHTML = "Executando envio para a Financeira... Mantenha a aba aberta ⏳";

        if (arquivo) {
            const reader = new FileReader();
            reader.onload = async (e) => {
                try {
                    const injection = await extAPI.scripting.executeScript({
                        target: { tabId: tabs[0].id },
                        func: scriptMoverFinanceira,
                        args: [processosIds, arquivo.name, arquivo.type, e.target.result]
                    });
                    if (injection && injection[0].result) { divRes.innerHTML = injection[0].result.join('<br>'); }
                } catch(err) { divRes.innerHTML = "❌ Erro de injeção: " + err.message; }
            };
            reader.readAsDataURL(arquivo);
        } else {
            try {
                const injection = await extAPI.scripting.executeScript({
                    target: { tabId: tabs[0].id }, 
                    func: scriptMoverFinanceira, 
                    args: [processosIds, null, null, null]
                });
                if (injection && injection[0].result) { divRes.innerHTML = injection[0].result.join('<br>'); }
            } catch(err) { divRes.innerHTML = "❌ Erro de injeção: " + err.message; }
        }
    });
}

// ============================================================================
// LÓGICA PARA BAIXAR ANEXOS DO FORMULÁRIO ABERTO
// ============================================================================
// A tela do Lecom não usa <a href> normal para os anexos (por isso a versão
// antiga baseada em querySelectorAll não achava nada). Segundo o .har de um
// download manual bem-sucedido:
//  - Campos de documento "soltos" no formulário guardam o valor no formato
//    "nomeDoArquivo.pdf:uuid-do-arquivo" (o mesmo padrão que o código de
//    movimentação para a Financeira já usa ao enviar o Ofício).
//  - Campos de documento dentro de GRIDs guardam o mesmo formato dentro de
//    _embedded.dataGridRows[].values.
//  - O download real é feito em
//    /bpm/api/v1/process-instances/{id}/activity-instances/{act}/cycles/{cycle}/documents/files/{fileUniqueId}/download
//    (ou com /grids/{gridId}/ no meio, para anexos que estão dentro de um grid),
//    e exige o header "ticket-sso" — por isso é feito por dentro da própria
//    página (mesma origem), não pelo popup.

// Função que roda DENTRO da página da Lecom: descobre e baixa os anexos
async function scriptBaixarAnexos(processInstanceId, activityInstanceId, cycle) {
    const ssoTicket = document.cookie.match(/(?:^|; )LecomSSOTicket=([^;]*)/)?.[1];
    if (!ssoTicket) return { logs: ["❌ ERRO: LecomSSOTicket não encontrado nos cookies."], files: [] };

    const headersPadrao = {
        "ticket-sso": ssoTicket,
        "Accept": "application/json;charset=UTF-8, application/json;q=0.8, text/plain;q=0.5, */*;q=0.2",
        "language": "pt_BR",
        "form-uuid": (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`)
    };

    let logs = [`🔎 Procurando anexos do processo ${processInstanceId} (atividade ${activityInstanceId}, ciclo ${cycle})...`];

    // Reconhece valores no formato "nomeDoArquivo.ext:uuid-do-arquivo"
    const docPattern = /^(.+):([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})$/;
    const encontrados = []; // { fileName, fileUniqueId, gridId (null se não for de grid) }

    // 1) Campos de documento "soltos" (fora de grids)
    try {
        const resValues = await fetch(`https://mapa.servicos.gov.br/form-web/api/form/form-initial-values?processInstanceId=${processInstanceId}&activityInstanceId=${activityInstanceId}&cycle=${cycle}`, { headers: headersPadrao });
        if (resValues.ok) {
            const dataValues = await resValues.json();
            const valuesArray = dataValues?._embedded?.fieldInitialValues || [];
            for (const f of valuesArray) {
                if (typeof f.value === 'string') {
                    const m = f.value.match(docPattern);
                    if (m) encontrados.push({ fileName: m[1], fileUniqueId: m[2], gridId: null });
                }
            }
        } else {
            logs.push(`⚠️ Não foi possível ler os campos do formulário (HTTP ${resValues.status}).`);
        }
    } catch (e) { logs.push(`⚠️ Erro ao ler campos do formulário: ${e.message}`); }

    // 2) Campos de documento dentro de grids
    try {
        const resStart = await fetch(`https://mapa.servicos.gov.br/form-web/api/form/start?processInstanceId=${processInstanceId}&activityInstanceId=${activityInstanceId}&cycle=${cycle}&isMobile=false`, { headers: headersPadrao });
        if (resStart.ok) {
            const dataStart = await resStart.json();
            const grids = (dataStart?.form?.fields || []).filter(f => f.type === "GRID").map(f => f.id);
            for (const gridId of grids) {
                try {
                    const resGrid = await fetch(`https://mapa.servicos.gov.br/form-app/workflow-service/process-instances/data-grid?processInstanceId=${processInstanceId}&activityInstanceId=${activityInstanceId}&cycle=${cycle}&gridId=${gridId}`, { headers: headersPadrao });
                    if (!resGrid.ok) continue;
                    const dataGrid = await resGrid.json();
                    const linhas = dataGrid?._embedded?.dataGridRows || [];
                    for (const linha of linhas) {
                        const vals = linha.values || {};
                        for (const chave in vals) {
                            const val = vals[chave];
                            if (typeof val === 'string') {
                                const m = val.match(docPattern);
                                if (m) encontrados.push({ fileName: m[1], fileUniqueId: m[2], gridId });
                            }
                        }
                    }
                } catch (e) {}
            }
        }
    } catch (e) { logs.push(`⚠️ Erro ao ler grids do formulário: ${e.message}`); }

    if (encontrados.length === 0) {
        logs.push("⚠️ Nenhum anexo encontrado neste formulário.");
        return { logs, files: [] };
    }

    logs.push(`📎 ${encontrados.length} anexo(s) encontrado(s). Baixando...`);

    // 3) Baixa cada arquivo e converte para base64 (o popup não tem acesso
    // direto ao cookie/ticket-sso, então o arquivo já vem pronto em data URL)
    const files = [];
    for (const doc of encontrados) {
        try {
            const url = doc.gridId
                ? `https://mapa.servicos.gov.br/bpm/api/v1/process-instances/${processInstanceId}/activity-instances/${activityInstanceId}/cycles/${cycle}/grids/${doc.gridId}/documents/files/${doc.fileUniqueId}/download?processInstanceId=${processInstanceId}&cycle=${cycle}&activityInstanceId=${activityInstanceId}&gridIdentifier=${doc.gridId}&fileUniqueId=${doc.fileUniqueId}`
                : `https://mapa.servicos.gov.br/bpm/api/v1/process-instances/${processInstanceId}/activity-instances/${activityInstanceId}/cycles/${cycle}/documents/files/${doc.fileUniqueId}/download?processInstanceId=${processInstanceId}&cycle=${cycle}&activityInstanceId=${activityInstanceId}&fileUniqueId=${doc.fileUniqueId}`;

            const resFile = await fetch(url, {
                headers: {
                    "ticket-sso": ssoTicket,
                    "Accept": "application/octet-stream, application/json;q=0.8, text/plain;q=0.5, */*;q=0.2",
                    "language": "pt_BR",
                    "form-uuid": (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`)
                }
            });
            if (!resFile.ok) { logs.push(`❌ Falha ao baixar "${doc.fileName}" (HTTP ${resFile.status}).`); continue; }

            const blob = await resFile.blob();
            const dataUrl = await new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => resolve(reader.result);
                reader.onerror = reject;
                reader.readAsDataURL(blob);
            });
            files.push({ fileName: doc.fileName, dataUrl });
            logs.push(`✅ "${doc.fileName}" pronto.`);
        } catch (e) {
            logs.push(`❌ Erro ao baixar "${doc.fileName}": ${e.message}`);
        }
    }

    logs.push(`🎯 Concluído: ${files.length} de ${encontrados.length} anexo(s) baixado(s).`);
    return { logs, files };
}

// ============================================================================
// PROCESSAMENTO COMPLETO EM LOTE
// (Verifica responsável atual -> Atribui mantendo-o -> Abre formulário -> Baixa anexos)
// ============================================================================

// Roda DENTRO da página do Mapa (na aba principal, já aberta pelo usuário):
// lê o processo, tenta descobrir o(s) responsável(is) atual(is) e atribui o
// processo ao usuário de destino MANTENDO quem já estava responsável.
//
// ⚠️ AJUSTE FUTURO: a forma exata como a API expõe o(s) responsável(is) atual(is)
// varia de sistema para sistema. Aqui tentamos vários caminhos comuns dentro de
// processData; se nenhum bater, o processo é atribuído só ao usuário de destino
// e um aviso aparece no log (com o JSON cru, resumido) para você me passar o
// formato certo e eu ajusto esta função.
async function scriptInfoEAtribuirUm(id, usuarioDestino) {
    const ssoTicket = document.cookie.match(/(?:^|; )LecomSSOTicket=([^;]*)/)?.[1];
    if (!ssoTicket) return { ok: false, logs: [`❌ Processo ${id}: LecomSSOTicket não encontrado nos cookies.`] };

    const headersJson = { "ticket-sso": ssoTicket, "Accept": "application/json" };
    let logs = [];
    let myUserId = 2722;

    try {
        const userRes = await fetch(`https://mapa.servicos.gov.br/workspace/api/user-logged`, { headers: headersJson });
        if (userRes.ok) { const u = await userRes.json(); myUserId = u.id || u.userId || u.codigo || myUserId; }
    } catch (e) {}

    try {
        const infoRes = await fetch(`https://mapa.servicos.gov.br/workspace/api/process/${id}/user/${myUserId}`, { headers: headersJson });
        if (!infoRes.ok) return { ok: false, logs: [`❌ Processo ${id}: falha ao ler processo (HTTP ${infoRes.status}).`] };
        const processData = await infoRes.json();
        const activityId = processData?.instance?.currentActivityInstanceId;
        const cycle = processData?.instance?.currentCycle;
        if (!activityId) return { ok: false, logs: [`⚠️ Processo ${id}: sem atividade atual (talvez já finalizado).`] };

        // ---- Tenta descobrir responsável(is) atual(is) ------------------------
        let responsaveisAtuais = [];
        const candidatos = [
            processData?.instance?.currentUsers,
            processData?.instance?.responsibleUsers,
            processData?.instance?.assignedUsers,
            processData?.instance?.currentUser ? [processData.instance.currentUser] : null,
            processData?.instance?.responsibleUser ? [processData.instance.responsibleUser] : null,
            processData?.responsibleUsers,
            processData?.currentUsers,
        ].filter(Boolean);

        for (const lista of candidatos) {
            if (Array.isArray(lista)) {
                lista.forEach(u => {
                    const login = (u && (u.login || u.username || u.user || u.userLogin)) || null;
                    if (login) responsaveisAtuais.push(login);
                });
            }
        }
        responsaveisAtuais = [...new Set(responsaveisAtuais)];

        if (responsaveisAtuais.length === 0) {
            let amostra = '';
            try { amostra = JSON.stringify(processData?.instance || {}).substring(0, 200); } catch (e) {}
            logs.push(`⚠️ Processo ${id}: não identifiquei automaticamente o responsável atual. Atribuindo só ao usuário de destino. (amostra: ${amostra}...)`);
        } else {
            logs.push(`👤 Processo ${id}: responsável(is) atual(is) detectado(s): ${responsaveisAtuais.join(', ')}`);
        }

        // ---- Atribui (destino + responsáveis anteriores, sem duplicar) -------
        const valores = [...new Set([usuarioDestino, ...responsaveisAtuais])];
        const payload = { values: valores, instances: [{ processInstanceId: id, activityInstanceId: activityId, cycle }], type: "USER" };
        const assignRes = await fetch("https://mapa.servicos.gov.br/workspace/api/process/process-instances/assign-to-users", {
            method: "POST", headers: { "Content-Type": "application/json", "ticket-sso": ssoTicket }, body: JSON.stringify(payload)
        });
        if (assignRes.ok) {
            logs.push(`✅ Processo ${id} atribuído para: ${valores.join(', ')}`);
        } else {
            logs.push(`❌ Processo ${id}: erro ao atribuir (HTTP ${assignRes.status}).`);
            return { ok: false, logs };
        }

        return { ok: true, activityId, cycle, logs };
    } catch (e) {
        return { ok: false, logs: [`❌ Processo ${id}: ${e.message}`] };
    }
}

// Espera uma aba (criada pela extensão) terminar de carregar.
function aguardarTabCarregada(extAPIRef, tabId, timeoutMs = 25000) {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
            extAPIRef.tabs.onUpdated.removeListener(listener);
            reject(new Error('Tempo esgotado esperando a página carregar.'));
        }, timeoutMs);
        function listener(updatedTabId, changeInfo) {
            if (updatedTabId === tabId && changeInfo.status === 'complete') {
                clearTimeout(timer);
                extAPIRef.tabs.onUpdated.removeListener(listener);
                resolve();
            }
        }
        extAPIRef.tabs.onUpdated.addListener(listener);
    });
}

// Monta um nome de pasta seguro para o downloads.download (subpastas usam "/").
function nomePastaSegura(id) {
    return `Lote_Processos/${id}`;
}

const btnProcessarLote = document.getElementById('btnProcessarLote');
if (btnProcessarLote) {
    btnProcessarLote.addEventListener('click', async () => {
        const processos = getProcessList();
        const usuarioDestino = document.getElementById('usuarioDestino')?.value;
        if (processos.length === 0) return alert("⚠️ Insira pelo menos um ID de processo.");
        if (!usuarioDestino) return alert("⚠️ Informe o usuário de destino.");

        let tabsAtivas = await extAPI.tabs.query({ active: true, currentWindow: true });
        if (!tabsAtivas[0] || !tabsAtivas[0].url.includes("mapa.servicos.gov.br")) {
            return alert("⚠️ Deixe uma aba do Mapa aberta e ativa antes de iniciar.");
        }
        const tabPrincipalId = tabsAtivas[0].id;

        btnProcessarLote.disabled = true;
        let logCompleto = [];
        const atualizarLog = (linhas) => {
            logCompleto.push(...(Array.isArray(linhas) ? linhas : [linhas]));
            divRes.innerHTML = logCompleto.join('<br>');
            divRes.scrollTop = divRes.scrollHeight;
        };

        atualizarLog(`🚀 Iniciando processamento completo de ${processos.length} processo(s)...`);

        let totalSalvos = 0, totalErros = 0;

        for (let i = 0; i < processos.length; i++) {
            const id = processos[i];
            atualizarLog(`— Processo ${id} (${i + 1}/${processos.length}) —`);

            // 1) Verifica responsável atual e atribui (na aba principal já aberta)
            let infoResultado;
            try {
                const injection = await extAPI.scripting.executeScript({
                    target: { tabId: tabPrincipalId },
                    func: scriptInfoEAtribuirUm,
                    args: [id, usuarioDestino]
                });
                infoResultado = injection && injection[0] && injection[0].result;
            } catch (err) {
                atualizarLog(`❌ Processo ${id}: erro de injeção (${err.message}).`);
                totalErros++;
                continue;
            }

            if (!infoResultado) { atualizarLog(`❌ Processo ${id}: sem resposta da página.`); totalErros++; continue; }
            atualizarLog(infoResultado.logs);
            if (!infoResultado.ok) { totalErros++; continue; }

            const { activityId, cycle } = infoResultado;

            // 2) Abre o formulário da etapa atual em uma aba de fundo (não rouba o foco)
            let novaTab;
            try {
                novaTab = await extAPI.tabs.create({
                    url: `https://mapa.servicos.gov.br/workspace/form-app/${id}/${activityId}/${cycle}?isNewForm=true`,
                    active: false
                });
                await aguardarTabCarregada(extAPI, novaTab.id);
                // pequena folga para o formulário (React/SPA) terminar de montar os campos
                await new Promise(r => setTimeout(r, 600));
            } catch (err) {
                atualizarLog(`❌ Processo ${id}: não consegui abrir/carregar o formulário (${err.message}).`);
                totalErros++;
                if (novaTab) { try { await extAPI.tabs.remove(novaTab.id); } catch (e) {} }
                continue;
            }

            // 3) Baixa os anexos dessa aba (reaproveita a mesma função do botão avulso)
            let resultadoAnexos;
            try {
                const injection = await extAPI.scripting.executeScript({
                    target: { tabId: novaTab.id },
                    func: scriptBaixarAnexos,
                    args: [String(id), String(activityId), String(cycle)]
                });
                resultadoAnexos = injection && injection[0] && injection[0].result;
            } catch (err) {
                atualizarLog(`❌ Processo ${id}: erro ao ler anexos (${err.message}).`);
            }

            try { await extAPI.tabs.remove(novaTab.id); } catch (e) {}

            if (!resultadoAnexos) { atualizarLog(`❌ Processo ${id}: falha ao buscar anexos.`); totalErros++; continue; }
            atualizarLog(resultadoAnexos.logs);

            // 4) Salva cada arquivo dentro de Downloads/Lote_Processos/{id}/
            const pasta = nomePastaSegura(id);
            let salvosDoProcesso = 0;
            for (const arquivo of resultadoAnexos.files) {
                const nomeArquivoSeguro = arquivo.fileName.replace(/[\\/:*?"<>|]/g, '_');
                let blobUrl = null;
                try {
                    const blob = dataUrlParaBlob(arquivo.dataUrl);
                    blobUrl = URL.createObjectURL(blob);
                    await extAPI.downloads.download({ url: blobUrl, filename: `${pasta}/${nomeArquivoSeguro}`, saveAs: false });
                    salvosDoProcesso++;
                    totalSalvos++;
                } catch (e) {
                    atualizarLog(`❌ Processo ${id}: erro ao salvar "${nomeArquivoSeguro}" (${e.message}).`);
                } finally {
                    if (blobUrl) setTimeout(() => URL.revokeObjectURL(blobUrl), 60000);
                }
            }
            atualizarLog(`📁 Processo ${id}: ${salvosDoProcesso} arquivo(s) salvo(s) em "Downloads/${pasta}/".`);
        }

        atualizarLog(`\n🎯 Processamento completo finalizado!\n💾 Total de arquivos salvos: ${totalSalvos}\n❌ Processos com erro: ${totalErros}`);
        btnProcessarLote.disabled = false;
    });
}

// Converte uma data URL (base64) em um Blob. Precisa ser feito aqui no
// popup/sidebar (contexto da extensão), NÃO dentro da página do site —
// o Firefox recusa "data:" URLs no downloads.download() (bug 1622986 do
// Mozilla) e também recusa "blob:" URLs criadas dentro de content scripts
// (bug 1696174). A URL blob: só funciona se for criada aqui.
function dataUrlParaBlob(dataUrl) {
    const [cabecalho, base64] = dataUrl.split(',');
    const mimeMatch = cabecalho.match(/:(.*?);/);
    const mime = mimeMatch ? mimeMatch[1] : 'application/octet-stream';
    const binario = atob(base64);
    const bytes = new Uint8Array(binario.length);
    for (let i = 0; i < binario.length; i++) bytes[i] = binario.charCodeAt(i);
    return new Blob([bytes], { type: mime });
}

const btnBaixarAnexos = document.getElementById('btnBaixarAnexos');
if (btnBaixarAnexos) {
    btnBaixarAnexos.addEventListener('click', async () => {
        let tabs = await extAPI.tabs.query({ active: true, currentWindow: true });
        const tabUrl = tabs[0]?.url || "";

        if (!tabs[0] || !tabUrl.includes("mapa.servicos.gov.br")) {
            return alert("⚠️ Abra um formulário no site do Mapa para usar esta função.");
        }

        // Extrai processInstanceId / activityInstanceId / cycle da URL da aba,
        // ex: https://mapa.servicos.gov.br/workspace/form-app/5822178/9/2?isNewForm=true
        const m = tabUrl.match(/form-app\/(\d+)\/(\d+)\/(\d+)/);
        if (!m) {
            return alert("⚠️ Abra o FORMULÁRIO de um processo (URL com /form-app/) para baixar os anexos.");
        }
        const [, processInstanceId, activityInstanceId, cycle] = m;

        divRes.innerHTML = "Analisando formulário em busca de anexos... ⏳";

        try {
            const injection = await extAPI.scripting.executeScript({
                target: { tabId: tabs[0].id },
                func: scriptBaixarAnexos,
                args: [processInstanceId, activityInstanceId, cycle]
            });

            const resultado = injection && injection[0] && injection[0].result;
            if (!resultado) { divRes.innerHTML = "❌ Não foi possível ler a página."; return; }

            divRes.innerHTML = resultado.logs.join('<br>');

            let salvos = 0;
            for (const arquivo of resultado.files) {
                const safeFileName = arquivo.fileName.replace(/[\\/:*?"<>|]/g, '_');
                let blobUrl = null;
                try {
                    // Cria o Blob e a URL blob: aqui mesmo, no popup — é isso
                    // que evita o erro "Access denied for URL data:...".
                    const blob = dataUrlParaBlob(arquivo.dataUrl);
                    blobUrl = URL.createObjectURL(blob);
                    await extAPI.downloads.download({ url: blobUrl, filename: safeFileName, saveAs: false });
                    salvos++;
                } catch (e) {
                    divRes.innerHTML += `<br>❌ Erro ao salvar "${safeFileName}": ${e.message}`;
                } finally {
                    // Libera a URL depois de um tempo, dando margem para o
                    // download começar antes de revogar a referência.
                    if (blobUrl) setTimeout(() => URL.revokeObjectURL(blobUrl), 60000);
                }
            }
            divRes.innerHTML += `<br>💾 ${salvos} de ${resultado.files.length} arquivo(s) salvo(s) na pasta de Downloads.`;
        } catch (err) {
            divRes.innerHTML = "❌ Erro: " + err.message;
        }
    });
}