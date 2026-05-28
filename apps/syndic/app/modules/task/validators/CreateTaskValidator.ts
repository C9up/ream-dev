import { rules, schema } from "@c9up/rune";

export interface CreateTaskInput {
	title: string;
	description: string;
	residenceId: string;
	visibility: string;
	urgency: string;
	buildingId?: string;
	unitId?: string;
	category?: string;
}

export const CreateTaskValidator = schema<CreateTaskInput>({
	title: rules.string().min(3).max(200).trim(),
	description: rules.string().min(10).max(5000).trim(),
	residenceId: rules.string().min(1),
	visibility: rules.string().min(1),
	urgency: rules.string().min(1),
	buildingId: rules.string().optional(),
	unitId: rules.string().optional(),
	category: rules.string().optional(),
});
