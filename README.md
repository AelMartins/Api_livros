> [!WARNING]
> Projeto em andamento
>
> Este repositório trata apenas do Back-End da aplicação. <br>
> O Front-End se encontra em **[github.com/JoaoVictorGarcia2/Livronline](https://github.com/JoaoVictorGarcia2/Livronline)**. <br>
> – _Antes de efetuar uma contribuição, lembre-se sempre de verificar a URL do repositório para aplicar suas propostas de modificações nos devidos lugares._
>
> Você pode acompanhar o processo de desenvolvimento pela pasta [management](https://github.com/JoaoVictorGarcia2/Livronline/tree/main/management).

Este é um projeto acadêmico interdisciplinar criado com propósitos avaliativos para a conclusão do sexto semestre da 5º turma do curso superior de Desenvolvimento de Software Multiplataforma oferecido pela Fatec Franca Dr. Thomaz Novelino do Centro Paula Souza (CPS).

Para mais informações sobre a Proposta Acadêmica, Descrição da Aplicação, Código de Conduta, Políticas de Segurança e Licença de desenvolvimento, acesse **[github.com/JoaoVictorGarcia2/Livronline/README.md](https://github.com/JoaoVictorGarcia2/Livronline?tab=readme-ov-file)**.

Caso se interesse em contribuir de alguma maneira na melhoria deste repositório, acesse nosso **[Guia de Contribuição](./.github/CONTRIBUTING.md)**.


## Sumário

1. [Instalação](#instalação)
2. [Inicialização](#inicialização) <br>
    2.1. [Aprendizagem de Máquina](#aprendizagem-de-máquina)

<br>

## Instalação



## Inicialização

### Aprendizagem de Máquina

> [!WARNING]
> É recomendado criar um ambiente virtual de desenvolvimento em Python no diretório **[machine-learning](./machine-learning)**. – _Utilizamos a versão 3.8.10_. – Para isso, use o comando:
>
> ```bash
> python -m venv venv
> ```
>
> **Tenha certeza de estar no diretório machine-learning.**
>
> Para ativar o ambiente virtual em dispositivo Windows:
>
> ```ps1
> venv\Scripts\activate
> ```
>
> Para ativar o ambiente virtual em dispositivo Linux:
> 
> ```bash
> source venv/bin/activate
> ```
>
> Para desativar o ambiente virtual:
>
> ```bash
> deactivate
> ```
>
> > [!NOTE] <br>
> > É possivel que você encontre algum problema ao ativar o ambiente devido a alguma configuração de segurança de seu sistema operacional. Leia atentamente as instruções que serão exibidas no terminal e **em último caso**, considere desativar temporariamente as políticas de segurança de execução de scripts para poder executar o comando.
>
> > [!NOTE] <br>
> > É possível qua a aplicação não reconheça os imports do Python devido a configurações do interpretador da linguagem do seu editor de código.
> >
> > Para solucionar esse problema, acesse as configurações (Settings) e as abra em formato JSON (Open Settings (JSON)) se houver a possibilidade.
> >
> > Adicione o seguinte script ajustando o caminho para o seu ambiente virtual:
> >
> > ```json
> > {
> >     // Outras configurações...
> >   
> >     // Para Windows
> >     "python.pythonPath": "caminho/para/seu/venv/Scripts/python.exe",
> >
> >     // Para Linux
> >     "python.pythonPath": "caminho/para/seu/venv/bin/python",
> >
> >     // Caminho para o diretório pai do seu ambiente virtual. No nosso caso "machine-learning"
> >     "python.venvPath": "caminho/para/seu/venv"
> > }
> > ```
> > 
> > **Lembre-se de remover os comentários do arquivo antes de salvar as alterações.**
> >
> > Salve e reinicie o Editor.
> >
> > Altere o interpretador Python para o seu ambiente virtual (no VS Code o atalho é `Ctrl` + `Shift` + `p`).

<br>

Instale as dependências através do arquivo [requirements.txt](./machine-learning/requirements.txt)

```bash
pip install -r requirements.txt
```

> [!WARNING]
> Sempre o atualize o arquivo requirements.txt caso adicione novas dependências através do comando:
>
> ```bash
> pip freeze > requirements.txt
> ```

Execute o servidor

```bash
python server.py
```

**Ele estará aberto em http://localhost:5000**

Para para se comunicar com o modelo de aprendizagem, você precisará enviar um JSON (método POST) para **http://localhost:5000/predict** no seguinte formato:

```json
{
    "title": "O Hobbit",
    "authors": ["J.R.R. Tolkien"],
    "categories": ["Fantasy", "Adventure"],
    "publisher": "HarperCollins",
    "published_year": "1937",
    "average_rating": 4.7,
    "average_review_rating": 4.8
}
```

Sua resposta será:

```json
{
  "recommendations": [
    { "index": 1053, "score": 0.9423 },
    { "index": 237,  "score": 0.9127 },
    ...
  ]
}
```

Este "index" deve ser utilizado para buscar os livros reais em seu banco de dados relacional com algo como:

```sql
SELECT * FROM books WHERE embedding_index IN (1053, 237, ...)
```

> [!NOTE] 
> Certifique-se de ter um campo como embedding_index no banco que corresponda à ordem dos embeddings carregados pelo book_embeddings.npy.
> 
> O index retornado pelo modelo de recomendação é a posição dos dados no array book_embeddings.npy.
> Ou seja, não é automaticamente o id do banco de dados, a menos que você tenha garantido isso na hora de gerar e salvar os dados.
> 
> Como utilizamos um DataFrame para gerar os embeddings, então o índice do DataFrame (df.index) corresponde diretamente à posição do embedding.
