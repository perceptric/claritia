/* The Claritia form block's editor, with no build step (WordPress's own globals). The page gets the code the server
   draws from these settings (claritia_embed in claritia.php); the editor shows which form it is. */
(function (wp) {
	var el = wp.element.createElement;
	var __ = wp.i18n.__;
	var InspectorControls = wp.blockEditor.InspectorControls;
	var useBlockProps = wp.blockEditor.useBlockProps;
	var PanelBody = wp.components.PanelBody;
	var TextControl = wp.components.TextControl;
	var SelectControl = wp.components.SelectControl;
	var Placeholder = wp.components.Placeholder;
	var ID = /([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i;
	var MODES = [
		{ value: 'inline', label: __('In the page', 'claritia') },
		{ value: 'full', label: __('Full page', 'claritia') },
		{ value: 'popup', label: __('Popup', 'claritia') },
		{ value: 'slider', label: __('Slider', 'claritia') },
		{ value: 'popover', label: __('Popover', 'claritia') },
		{ value: 'sidetab', label: __('Side tab', 'claritia') }
	];

	wp.blocks.registerBlockType('claritia/form', {
		edit: function (props) {
			var a = props.attributes;
			var set = props.setAttributes;
			var id = (ID.exec(a.form || '') || [])[1];
			var needsText = a.mode === 'popup' || a.mode === 'slider' || a.mode === 'sidetab';
			var formField = function (key) {
				return el(TextControl, { key: key, label: __('Form link or ID', 'claritia'), value: a.form, onChange: function (v) { set({ form: v }); } });
			};
			var controls = [
				formField('form'),
				el(SelectControl, { key: 'mode', label: __('Show it', 'claritia'), value: a.mode, options: MODES, onChange: function (v) { set({ mode: v }); } }),
				needsText
					? el(TextControl, { key: 'text', label: a.mode === 'sidetab' ? __('Tab text', 'claritia') : __('Button text', 'claritia'), value: a.text, onChange: function (v) { set({ text: v }); } })
					: null
			];
			return el(
				'div',
				useBlockProps(),
				el(InspectorControls, null, el(PanelBody, { title: __('Form', 'claritia') }, controls)),
				el(
					Placeholder,
					{
						icon: 'feedback',
						label: __('Claritia form', 'claritia'),
						instructions: id ? __('This form shows on the published page:', 'claritia') + ' ' + id : __("Paste the form's link from its Share tab.", 'claritia')
					},
					id ? null : formField('form-inline')
				)
			);
		},
		save: function () {
			return null;
		}
	});
})(window.wp);
