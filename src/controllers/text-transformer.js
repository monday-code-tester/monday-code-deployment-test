const mondayService = require('../services/monday-service');

const TRANSFORMATION_TYPES = [
  { title: 'to upper case', value: 'TO_UPPER_CASE' },
  { title: 'to lower case', value: 'TO_LOWER_CASE' },
  { title: 'to current region', value: 'TO_CURRENT_REGION' }
];

const transformText = (value, type) => {
  switch (type) {
    case 'TO_UPPER_CASE':
      return value.toUpperCase();
    case 'TO_LOWER_CASE':
      return value.toLowerCase();
    case 'TO_CURRENT_REGION':
      return process.env.MNDY_REGION?.toUpperCase || 'MNDY_REGION env var was null or undefined';
    default:
      return value.toUpperCase();
  }
};

async function executeAction(req, res) {
  const { shortLivedToken } = req.session;
  const { payload } = req.body;

  try {
    const { inputFields } = payload;
    const { boardId, itemId, sourceColumnId, targetColumnId, transformationType } = inputFields;

    const text = await mondayService.getColumnValue(shortLivedToken, itemId, sourceColumnId);
    if (!text) {
      return res.status(200).send({});
    }
    const transformedText = transformText(
      text,
      transformationType ? transformationType.value : 'TO_UPPER_CASE'
    );

    await mondayService.changeColumnValue(shortLivedToken, boardId, itemId, targetColumnId, transformedText);

    return res.status(200).send({});
  } catch (err) {
    console.error(err);
    return res.status(500).send({ message: 'internal server error' });
  }
}

async function getRemoteListOptions(req, res) {
  try {
    return res.status(200).send(TRANSFORMATION_TYPES);
  } catch (err) {
    console.error(err);
    return res.status(500).send({ message: 'internal server error' });
  }
}

module.exports = {
  executeAction,
  getRemoteListOptions
};
