// app/static/js/services/simulationService.js

/**
 * Busca os dados da simulação no backend Python (/api/simular).
 * O backend Python, por sua vez, chamará o n8n.
 * @param {FormData} formData - Os dados do formulário de simulação.
 * @returns {Promise<Array<Object>>} - Uma promessa que resolve para o array de resultados da simulação.
 */
export async function fetchSimulacao(formData) {
    // Converte FormData para um objeto JSON simples
    const data = Object.fromEntries(formData.entries());

    console.log("Enviando para /api/simular:", data);

    const response = await fetch('/api/simular', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
    });

    if (!response.ok) {
        const errorData = await response.json();
        console.error("Erro da API /api/simular:", errorData);
        throw new Error(errorData.message || `Erro ${response.status}: Falha ao buscar simulação.`);
    }

    const simulationResults = await response.json();

    // O frontend (precificar.js) espera um array de respostas.
    // Se o agente retornar apenas um objeto, colocamos ele dentro de um array.
    if (!Array.isArray(simulationResults)) {
        console.warn("Resposta da API não era um array, encapsulando:", simulationResults);
        return [simulationResults];
    }

    return simulationResults;
}

// Funções utilitárias que 'precificar.js' também importa
export function formatCurrency(value) {
    if (typeof value !== 'number') value = parseFloat(value) || 0;
    return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export function formatPercent(value) {
    if (typeof value !== 'number') value = parseFloat(value) || 0;
    // Converte 10.0 para "10,00%"
    return `${value.toFixed(2)}%`.replace('.', ',');
}